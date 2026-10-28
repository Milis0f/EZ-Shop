import { countryName } from "@/components/ai/ai-reading";
import type { AnalysisResult, CountryAnalysis } from "@/domain/analysis";
import type { Assumption } from "@/domain/assumption";
import type { CountryCode } from "@/domain/country";
import { isKnown, type Datum, type Interval, type Known, type ValueKind } from "@/domain/datum";
import type { ChannelCost } from "@/domain/market";
import { INTL_LOCALES, type Locale } from "@/i18n/config";
import { formatDecimal, formatInt, formatMoney, formatPct, formatRatioPct } from "@/i18n/format";
import { t } from "@/i18n/translate";
import { PLATFORM_LABELS } from "@/lib/format";
import { collectNumbersFor } from "./number-guard";
import { PROMPT_WORDS, type PromptWords } from "./prompt-words";

/**
 * Fact sheet of a stored analysis, in the language the reading will be written in: the only text
 * the local AI reads. It holds what the analysis really contains (known values with their kind and
 * source, DATA_INSUFFICIENT items with their reason) and nothing else: no secret, no URL, no raw
 * error, no internal id.
 *
 * Numbers are formatted for the sheet's locale, and `numbers` holds the numbers of the sheet's VALUES
 * only (not of its labels, scales or headings), normalised by the number guard with that same
 * locale: the AI may repeat these and no other. The sheet carries no date.
 */

export interface FactSheet {
  readonly text: string;
  readonly numbers: ReadonlySet<string>;
  /** The locale the sheet is written in: the number guard must read the AI text with it. */
  readonly locale: Locale;
}

export interface FactSheetOptions {
  /** Language of the sheet, and so of the reading. French (the sheet before i18n) by default. */
  readonly locale?: Locale;
  /** Leaves out advertising costs, revenue, assumptions and secondary signals, for analyses with many countries. */
  readonly brief?: boolean;
  /**
   * Writes countries whose facts are word for word the same once, under one heading listing them all.
   * Real analyses of many countries often hold the same gaps in most of them (no source for those markets).
   */
  readonly groupSameCountries?: boolean;
}

const MAX_REASON_LENGTH = 160;
const MAX_NAME_LENGTH = 120;
const MAX_SOURCES_SHOWN = 2;

/**
 * Value marks: every fragment that states a value of the analysis is wrapped in these control
 * characters while the sheet is built. Only marked fragments feed the allowed numbers; labels,
 * scales (« sur 100 »), windows (« 12 derniers mois ») and percentile names never do. `clean`
 * strips control characters, so text from the analysis can never forge a mark.
 */
const VALUE_OPEN = "\u0002";
const VALUE_CLOSE = "\u0003";
const VALUE_SPAN = /\u0002([^\u0002\u0003]*)\u0003/g;
const val = (text: string): string => `${VALUE_OPEN}${text}${VALUE_CLOSE}`;

/** Everything a section needs to write in one language. */
class Writer {
  readonly w: PromptWords;
  private readonly months: readonly string[];

  constructor(readonly locale: Locale) {
    this.w = PROMPT_WORDS[locale];
    const monthFormat = new Intl.DateTimeFormat(INTL_LOCALES[locale], { month: "long", timeZone: "UTC" });
    this.months = Array.from({ length: 12 }, (_, i) => monthFormat.format(new Date(Date.UTC(2024, i, 1))));
  }

  /** Display text without anything that could carry a secret: URLs, long key-like tokens, control characters. */
  clean(text: string, maxLength: number): string {
    const cleaned = text
      .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, this.w.s.linkRemoved)
      .replace(/[A-Za-z0-9_-]{24,}/g, this.w.s.valueRemoved)
      .replace(/[\u0000-\u001F\u007F]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trimEnd()}…` : cleaned;
  }

  int = (v: number): string => val(formatInt(v, this.locale));
  pct = (v: number, signed?: boolean): string => val(formatPct(v, this.locale, { signed }));
  ratio = (v: number): string => val(formatRatioPct(v, this.locale));
  /** Small values keep one decimal so they are not rounded to zero. */
  amount = (v: number): string => val(Math.abs(v) >= 10 ? formatInt(v, this.locale) : formatDecimal(v, this.locale));
  money = (v: number, currency = "EUR"): string => val(formatMoney(v, this.locale, currency));
  /** Value first, percentile after: "P10 120" would read as one number with a thousands space. */
  interval = (i: Interval, format: (v: number) => string): string =>
    t(this.w.s.interval, { p10: format(i.p10), p50: format(i.p50), p90: format(i.p90) });
  monthList = (months: readonly number[]): string =>
    months.map((m) => this.months[m - 1]).filter(Boolean).join(", ");
  line = (label: string, text: string): string => `- ${label}${this.w.colon}${text}`;
  country = (code: CountryCode): string => `${countryName(code, this.locale)} (${code})`;
}

interface Gap {
  readonly label: string;
  readonly reason: string;
  readonly missing: readonly string[];
}

/** Writes known values with a short provenance tag and keeps DATA_INSUFFICIENT items aside. */
class Section {
  readonly lines: string[] = [];
  readonly gaps: Gap[] = [];

  /** `flagMock`: name mock sources as such (in a live analysis; a mock analysis says it once in the header). */
  constructor(
    readonly writer: Writer,
    private readonly flagMock: boolean,
  ) {}

  tag(sources: Known<unknown>["sources"], kind: ValueKind): string {
    const { w } = this.writer;
    const names = [...new Set(sources.map((s) => `${w.sources[s.sourceId]}${this.flagMock && s.origin === "mock" ? w.s.mockSource : ""}`))];
    const shown = names.slice(0, MAX_SOURCES_SHOWN).join(", ");
    const more = names.length > MAX_SOURCES_SHOWN ? t(w.s.moreSources, { count: names.length - MAX_SOURCES_SHOWN }) : "";
    return `[${w.kind[kind]}${shown ? `${w.tagSeparator}${shown}${more}` : ""}]`;
  }

  add<T>(label: string, d: Datum<T> | undefined, render: (value: T) => string | null, kind?: ValueKind): void {
    if (d === undefined) return;
    if (!isKnown(d)) {
      this.gap(label, d.reason, d.missing);
      return;
    }
    const text = render(d.value);
    if (text !== null) this.lines.push(`${this.writer.line(label, text)} ${this.tag(d.sources, kind ?? d.kind)}`);
  }

  gap(label: string, reason: string, missing: readonly string[]): void {
    const { w } = this.writer;
    this.gaps.push({
      label,
      reason: val(this.writer.clean(reason, MAX_REASON_LENGTH) || w.s.reasonUnspecified),
      missing: missing.map((m) => this.writer.clean(w.missing(m), 60)),
    });
  }
}

const gapKey = (g: Gap): string => `${g.label}\u0000${g.reason}`;

/** Gaps grouped by reason: "- label, label : reason (manque : …)". */
function gapLines(writer: Writer, gaps: readonly Gap[]): string[] {
  const byReason = new Map<string, { labels: string[]; missing: Set<string> }>();
  for (const g of gaps) {
    const entry = byReason.get(g.reason) ?? { labels: [], missing: new Set<string>() };
    if (!entry.labels.includes(g.label)) entry.labels.push(g.label);
    for (const m of g.missing) entry.missing.add(m);
    byReason.set(g.reason, entry);
  }
  return [...byReason].map(([reason, { labels, missing }]) => {
    const lacking = missing.size > 0 ? t(writer.w.s.lacking, { list: [...missing].join(", ") }) : "";
    return `${writer.line(labels.join(", "), reason)}${lacking}`;
  });
}

/** Wikipedia readers of the topic article, labelled in the sheet's language (see interestPerMonth in the report engine). */
function topicReaders(c: CountryAnalysis, writer: Writer): { value: number; label: string } | null {
  const history = c.demand.history;
  if (!isKnown(history) || history.value.basis !== "topic_interest") return null;
  const last = history.value.series.slice(-12);
  if (last.length === 0) return null;
  const article = c.signals && isKnown(c.signals.topicInterest) ? c.signals.topicInterest.value.article : writer.w.s.theCategory;
  return { value: Math.round(last.reduce((s, p) => s + p.value, 0) / last.length), label: t(writer.w.s.wikiReaders, { article }) };
}

function demandLines(c: CountryAnalysis, s: Section, brief: boolean): void {
  const { demand } = c;
  const { writer } = s;
  const { w } = writer;
  // A search-volume history is already said by the searches line; other bases need their warning.
  if (!brief && isKnown(demand.history) && demand.history.value.basis !== "absolute_volume") {
    s.add(w.s.history, demand.history, (h) => t(w.s.historyValue, { basis: w.basis[h.basis], months: writer.int(h.series.length) }));
  }

  const direct: boolean = isKnown(demand.avgMonthlySearches);
  const readers = direct ? null : topicReaders(c, writer);
  if (direct) {
    s.add(w.s.searchesAverage, demand.avgMonthlySearches, (v) => writer.amount(v));
  } else if (readers && isKnown(demand.history)) {
    s.lines.push(`${writer.line(w.s.interestAverage, writer.amount(readers.value))} ${val(writer.clean(readers.label, 140))} ${s.tag(demand.history.sources, "derived")}`);
  } else {
    s.add(w.s.searches, demand.avgMonthlySearches, (v) => writer.amount(v));
  }

  s.add(w.s.trend, demand.trend, (tr) =>
    t(w.s.trendValue, { direction: w.trend[tr.direction], pct: writer.pct(tr.annualGrowthPct, true), months: writer.int(tr.monthsUsed) }),
  );
  s.add(w.s.seasonality, demand.seasonality, (v) =>
    v.isSeasonal && v.peakMonths.length > 0 ? t(w.s.seasonalPeaks, { months: writer.monthList(v.peakMonths) }) : v.isSeasonal ? w.s.seasonal : w.s.regular,
  );
  s.add(w.s.nextPeak, demand.monthsToNextPeak, (m) => (m === 0 ? w.s.thisMonth : t(w.s.inMonths, { months: writer.int(m) })));
  s.add(w.s.futureDemand, demand.futureGrowthPct, (v) => t(w.s.futureValue, { pct: writer.pct(v, true) }));
}

/** One line per metric across ad platforms (median only), to keep the sheet short. */
function channelLine(s: Section, label: string, channels: readonly ChannelCost[], pick: (c: ChannelCost) => Datum<Interval>): void {
  const { writer } = s;
  const known: { platform: string; d: Known<Interval> }[] = [];
  for (const channel of channels) {
    const d = pick(channel);
    const platform = PLATFORM_LABELS[channel.platform];
    if (isKnown(d)) known.push({ platform, d });
    else s.gap(`${label} ${platform}`, d.reason, d.missing);
  }
  if (known.length === 0) return;
  const values = known.map(({ platform, d }) => `${platform} ${writer.money(d.value.p50)}`).join(", ");
  const kind = known.some(({ d }) => d.kind === "estimate") ? "estimate" : known[0].d.kind;
  s.lines.push(`${writer.line(t(writer.w.s.median, { label }), values)} ${s.tag(known.flatMap(({ d }) => d.sources), kind)}`);
}

function marketLines(c: CountryAnalysis, s: Section, currency: string, brief: boolean): void {
  const { writer } = s;
  const { w } = writer;
  s.add(w.s.competitionNow, c.competition.current, (v) => t(w.s.competitionValue, { level: w.competition[v.level], index: writer.int(v.index) }));
  s.add(w.s.competitionFuture, c.competition.future, (v) => w.outlook[v.outlook]);
  s.add(w.s.orders, c.sales.monthlyOrders, (i) => writer.interval(i, writer.amount));
  if (brief) return;
  s.add(w.s.revenue, c.sales.annualRevenue, (i) => writer.interval(i, (v) => writer.money(v, currency)));
  channelLine(s, w.s.cpc, c.advertising, (ch) => ch.cpc);
  channelLine(s, w.s.testBudget, c.advertising, (ch) => ch.testBudget);
}

function signalLines(c: CountryAnalysis, s: Section, brief: boolean): void {
  const v2 = c.signals;
  if (!v2) return;
  // Legacy marketPriceExVatEur and marketMarginPct (median eBay price) are left out: decision 5 turned
  // derived marketplace statistics off, so the AI must not restate them from analyses stored before.
  if (brief) return;
  const { writer } = s;
  const { w } = writer;
  s.add(w.s.related, v2.searchSuggestions, (g) => {
    const shops = g.marketplaces.length > 0 ? t(w.s.relatedShops, { list: g.marketplaces.slice(0, 3).map((m) => val(writer.clean(m, 40))).join(", ") }) : "";
    return t(w.s.relatedValue, { count: writer.int(g.suggestions.length), intent: writer.int(g.intent.length), shops });
  });
  s.add(w.s.videos, v2.content, (v) => {
    const views = v.medianViews === null ? "" : t(w.s.videosViews, { views: writer.int(v.medianViews) });
    return t(w.s.videosValue, { count: writer.int(v.videosLast12Months), views });
  });
  s.add(w.s.ebay, v2.marketplace, (m) => {
    const price = m.priceEur ? t(w.s.ebayPrice, { price: writer.money(m.priceEur.median) }) : "";
    const china = m.chinaShare === null ? "" : t(w.s.ebayChina, { share: writer.ratio(m.chinaShare) });
    return t(w.s.ebayValue, { count: writer.int(m.listings), price, china });
  });
  s.add(w.s.wikiAudience, v2.topicInterest, () => null);
  s.add(w.s.taxes, v2.taxes, (tx) => {
    const vat = tx.vatRatePct === null ? w.s.noVat : t(w.s.vat, { pct: writer.pct(tx.vatRatePct) });
    if (tx.dutyRatePct === null) return vat;
    const { min, max } = tx.dutyRatePct;
    return t(w.s.duty, { vat, duty: min === max ? writer.pct(min) : t(w.s.dutyRange, { min: writer.pct(min), max: writer.pct(max) }) });
  });
  s.add(w.s.unitCost, v2.unitCostEur, (v) => writer.money(v));
}

function countrySection(c: CountryAnalysis, writer: Writer, currency: string, flagMock: boolean, brief: boolean): Section {
  const { scoring } = c;
  const { w } = writer;
  const s = new Section(writer, flagMock);
  s.lines.push(writer.line(w.s.decisionLine, w.decision[scoring.decision]));
  s.add(w.s.score, scoring.score, (v) => t(w.s.outOf100, { value: writer.int(v.total) }));
  s.lines.push(
    `${writer.line(w.s.confidenceLine, `${t(w.s.outOf100, { value: writer.int(scoring.confidence.score) })}, ${w.confidence[scoring.confidence.level]}`)} [${w.kind.derived}]`,
  );
  if (c.languageMismatch) s.lines.push(`- ${w.s.languageMismatch}`);
  demandLines(c, s, brief);
  marketLines(c, s, currency, brief);
  signalLines(c, s, brief);
  return s;
}

function assumptionLine(a: Assumption, writer: Writer): string {
  const { w } = writer;
  const format = (v: number) => (a.unit === "ratio" ? writer.ratio(v) : a.unit === "percent" ? writer.pct(v) : writer.amount(v));
  const d = a.distribution;
  const value = d.type === "fixed" ? format(d.value) : t(w.s.assumptionRange, { min: format(d.min), max: format(d.max), mode: format(d.mode) });
  return `${writer.line(writer.clean(a.label, 80), value)} [${w.kind.assumption}${w.tagSeparator}${a.origin === "user" ? w.s.userInput : w.s.defaultSetting}]`;
}

function headerLines(analysis: AnalysisResult, writer: Writer, flagMock: boolean, brief: boolean): string[] {
  const { economics } = analysis;
  const { w } = writer;
  const countries = analysis.countries.map((c) => writer.country(c.country));
  const typed = `[${w.kind.assumption}${w.tagSeparator}${w.s.userInput}]`;
  const price = (label: string, v: number | undefined) =>
    v === undefined ? writer.line(label, w.s.notGiven) : `${writer.line(label, writer.money(v, economics.currency))} ${typed}`;
  const lines = [
    w.s.heading,
    `${w.s.product}${w.colon}${w.quote(val(writer.clean(analysis.product.displayName, MAX_NAME_LENGTH)))}`,
    analysis.dataMode === "mock" ? w.s.mockMode : w.s.liveMode,
    `${t(w.s.countries, { count: writer.int(countries.length) })}${w.colon}${countries.join(", ")}`,
    price(w.s.sellingPrice, economics.sellingPrice),
    price(w.s.landedCost, economics.landedCost),
  ];
  const global = new Section(writer, flagMock);
  global.add(w.s.aliexpress, analysis.sourcing, (o) => t(w.s.aliexpressValue, { price: writer.money(o.priceEur.median), count: writer.int(o.sampled) }));
  global.add(w.s.hsCode, analysis.classification, (h) =>
    // A searched code can be plainly wrong ("casquette" → "cap" → bottle caps): its description is left out so the
    // model cannot describe the product from it. A code typed by the user keeps its description.
    h.method === "search"
      ? t(w.s.hsSearched, { code: val(writer.clean(h.code, 14)) })
      : `${val(writer.clean(h.code, 14))} (${val(writer.clean(h.description, 120))})`,
  );
  lines.push(...global.lines);
  if (global.gaps.length > 0) lines.push(w.s.insufficient, ...gapLines(writer, global.gaps));
  if (!brief && analysis.assumptions.length > 0) lines.push(w.s.assumptions, ...analysis.assumptions.map((a) => assumptionLine(a, writer)));
  return lines;
}

/** Compact fact sheet of a stored analysis in one language, and the numbers the AI may repeat. */
export function buildFactSheet(analysis: AnalysisResult, options: FactSheetOptions = {}): FactSheet {
  const locale = options.locale ?? "fr";
  const writer = new Writer(locale);
  const { w } = writer;
  const brief = options.brief ?? false;
  const flagMock = analysis.dataMode !== "mock";
  const currency = analysis.economics.currency;
  const countries = analysis.countries.map((c) => ({ c, s: countrySection(c, writer, currency, flagMock, brief) }));

  // Gaps shared by every country are written once, not once per country.
  const counts = new Map<string, number>();
  for (const { s } of countries) for (const key of new Set(s.gaps.map(gapKey))) counts.set(key, (counts.get(key) ?? 0) + 1);
  const shared = countries.length > 1 ? new Set([...counts].filter(([, n]) => n === countries.length).map(([key]) => key)) : new Set<string>();

  const sections = [headerLines(analysis, writer, flagMock, brief)];
  const sharedGaps = countries[0]?.s.gaps.filter((g) => shared.has(gapKey(g))) ?? [];
  if (sharedGaps.length > 0) sections.push([w.s.insufficientEverywhere, ...gapLines(writer, sharedGaps)]);

  // Insertion order keeps the analysis order (a group sits where its first country is).
  const blocks = new Map<string, { names: string[]; body: string[] }>();
  for (const { c, s } of countries) {
    const body = [...s.lines];
    const own = s.gaps.filter((g) => !shared.has(gapKey(g)));
    if (own.length > 0) body.push(w.s.insufficient, ...gapLines(writer, own));
    if (flagMock && c.scoring.confidence.mockTainted) body.push(w.s.mockTainted);
    const name = writer.country(c.country);
    const key = options.groupSameCountries ? body.join("\n") : c.country;
    const block = blocks.get(key);
    if (block) block.names.push(name);
    else blocks.set(key, { names: [name], body });
  }
  for (const { names, body } of blocks.values()) {
    const heading = names.length === 1 ? `## ${names[0]}` : `## ${t(w.s.sameFacts, { names: names.join(", ") })}`;
    sections.push([heading, ...body]);
  }

  // Plain spaces: Intl's narrow no-break spaces read worse for the model, and the guard treats them alike.
  const marked = sections
    .map((lines) => lines.join("\n"))
    .join("\n\n")
    .replace(/[  ]/g, " ");
  // Only value fragments become citable numbers; the marks are removed from what the model reads.
  const values = [...marked.matchAll(VALUE_SPAN)].map((m) => m[1]);
  const text = marked.replace(/[\u0002\u0003]/g, "");
  return { text, numbers: collectNumbersFor(locale, values), locale };
}
