import type { AnalysisResult, CountryAnalysis } from "@/domain/analysis";
import type { Assumption } from "@/domain/assumption";
import { getCountry } from "@/domain/country";
import { isKnown, type Datum, type Interval, type Known, type ValueKind } from "@/domain/datum";
import type { ChannelCost, DemandBasis } from "@/domain/market";
import type { SourceId } from "@/domain/provenance";
import { interestPerMonth } from "@/engine/report/simple-summary";
import {
  COMPETITION_LABELS,
  CONFIDENCE_LABELS,
  DECISION_LABELS,
  OUTLOOK_LABELS,
  PLATFORM_LABELS,
  TREND_LABELS,
  formatDecimal,
  formatInt,
  formatMoney,
  formatPct,
  formatRatioPct,
  missingLabel,
} from "@/lib/format";
import { collectNumbers } from "./number-guard";

/**
 * French fact sheet of a stored analysis: the only text the local AI reads. It holds what the
 * analysis really contains (known values with their kind and source, DATA_INSUFFICIENT items with
 * their reason) and nothing else: no secret, no URL, no raw error, no internal id.
 *
 * `numbers` is every number of the sheet, normalised by the number guard: the AI may repeat these
 * and no other.
 */

export interface FactSheet {
  readonly text: string;
  readonly numbers: ReadonlySet<string>;
}

export interface FactSheetOptions {
  /** Leaves out advertising costs, revenue, assumptions and secondary signals, for analyses with many countries. */
  readonly brief?: boolean;
  /**
   * Writes countries whose facts are word for word the same once, under one heading listing them all.
   * Real analyses of many countries often hold the same gaps in most of them (no source for those markets).
   */
  readonly groupSameCountries?: boolean;
}

const KIND_WORDS: Record<ValueKind, string> = {
  observed: "observé",
  assumption: "hypothèse",
  derived: "calcul",
  estimate: "estimation",
};

const MONTH_NAMES_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
] as const;

const BASIS_LABELS: Record<DemandBasis, string> = {
  absolute_volume: "volumes de recherche mensuels",
  relative_index: "indice d'intérêt relatif de 0 à 100 (forme de la courbe, pas un volume)",
  topic_interest: "lectures de l'article Wikipédia de la catégorie (pas des recherches, pas par pays)",
};

/** Short source names: the tag is repeated on every line, and the context of the local model is small. */
const SOURCE_NAMES: Record<SourceId, string> = {
  "google-trends": "Google Trends",
  "google-ads-keyword-planner": "Google Ads",
  "meta-ad-library": "Meta Ad Library",
  "tiktok-commercial-content": "TikTok Commercial Content",
  "meta-marketing-api": "Meta Marketing API",
  "tiktok-business-api": "TikTok API",
  "world-bank": "Banque mondiale",
  eurostat: "Eurostat",
  oecd: "OCDE",
  "google-autocomplete": "Google Autocomplete",
  wikimedia: "Wikipédia",
  "youtube-data": "YouTube",
  "ebay-browse": "eBay",
  "aliexpress-affiliate": "AliExpress",
  "uk-trade-tariff": "tarif douanier UK/UE",
  "usitc-hts": "tarif douanier US",
  "vat-rates": "taux de TVA",
  "ecb-fx": "BCE",
  mymemory: "traduction automatique",
  "user-input": "saisie utilisateur",
  assumptions: "hypothèses",
};

const MAX_REASON_LENGTH = 160;
const MAX_NAME_LENGTH = 120;
const MAX_SOURCES_SHOWN = 2;

/** Display text without anything that could carry a secret: URLs, long key-like tokens, control characters. */
function clean(text: string, maxLength: number): string {
  const cleaned = text
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[lien retiré]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[valeur retirée]")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trimEnd()}…` : cleaned;
}

/** Small values keep one decimal so they are not rounded to zero. */
const amount = (v: number): string => (Math.abs(v) >= 10 ? formatInt(v) : formatDecimal(v));
const money = (v: number, currency = "EUR"): string => formatMoney(v, currency);
/** Value first, percentile after: "P10 120" would read as one number with a thousands space. */
const interval = (i: Interval, format: (v: number) => string): string =>
  `bas ${format(i.p10)}, médian ${format(i.p50)}, haut ${format(i.p90)} (P10, P50, P90)`;
const monthList = (months: readonly number[]): string =>
  months.map((m) => MONTH_NAMES_FR[m - 1]).filter(Boolean).join(", ");

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
  constructor(private readonly flagMock: boolean) {}

  tag(sources: Known<unknown>["sources"], kind: ValueKind): string {
    const names = [...new Set(sources.map((s) => `${SOURCE_NAMES[s.sourceId]}${this.flagMock && s.origin === "mock" ? " (fictif)" : ""}`))];
    const shown = names.slice(0, MAX_SOURCES_SHOWN).join(", ");
    const more = names.length > MAX_SOURCES_SHOWN ? ` et ${names.length - MAX_SOURCES_SHOWN} autres` : "";
    return `[${KIND_WORDS[kind]}${shown ? ` ; ${shown}${more}` : ""}]`;
  }

  add<T>(label: string, d: Datum<T> | undefined, render: (value: T) => string | null, kind?: ValueKind): void {
    if (d === undefined) return;
    if (!isKnown(d)) {
      this.gap(label, d.reason, d.missing);
      return;
    }
    const text = render(d.value);
    if (text !== null) this.lines.push(`- ${label} : ${text} ${this.tag(d.sources, kind ?? d.kind)}`);
  }

  gap(label: string, reason: string, missing: readonly string[]): void {
    this.gaps.push({
      label,
      reason: clean(reason, MAX_REASON_LENGTH) || "raison non précisée",
      missing: missing.map((m) => clean(missingLabel(m), 60)),
    });
  }
}

const gapKey = (g: Gap): string => `${g.label}\u0000${g.reason}`;

/** Gaps grouped by reason: "- label, label : reason (manque : …)". */
function gapLines(gaps: readonly Gap[]): string[] {
  const byReason = new Map<string, { labels: string[]; missing: Set<string> }>();
  for (const g of gaps) {
    const entry = byReason.get(g.reason) ?? { labels: [], missing: new Set<string>() };
    if (!entry.labels.includes(g.label)) entry.labels.push(g.label);
    for (const m of g.missing) entry.missing.add(m);
    byReason.set(g.reason, entry);
  }
  return [...byReason].map(([reason, { labels, missing }]) => {
    const lacking = missing.size > 0 ? ` (manque : ${[...missing].join(", ")})` : "";
    return `- ${labels.join(", ")} : ${reason}${lacking}`;
  });
}

function demandLines(c: CountryAnalysis, s: Section, brief: boolean): void {
  const { demand } = c;
  // A search-volume history is already said by the searches line; other bases need their warning.
  if (!brief && isKnown(demand.history) && demand.history.value.basis !== "absolute_volume") {
    s.add("Historique de la demande", demand.history, (h) => `${BASIS_LABELS[h.basis]}, ${formatInt(h.series.length)} mois`);
  }

  const interest = interestPerMonth(c);
  if (interest?.direct) {
    s.add("Recherches Google par mois (moyenne)", demand.avgMonthlySearches, (v) => amount(v));
  } else if (interest && isKnown(demand.history)) {
    s.lines.push(`- Intérêt par mois (moyenne des 12 derniers mois) : ${amount(interest.value)} ${clean(interest.label, 140)} ${s.tag(demand.history.sources, "derived")}`);
  } else {
    s.add("Recherches Google par mois", demand.avgMonthlySearches, (v) => amount(v));
  }

  s.add("Tendance", demand.trend, (t) => `${TREND_LABELS[t.direction].toLowerCase()}, ${formatPct(t.annualGrowthPct, true)} par an (calculée sur ${formatInt(t.monthsUsed)} mois)`);
  s.add("Saisonnalité", demand.seasonality, (v) =>
    v.isSeasonal && v.peakMonths.length > 0 ? `saisonnière, mois de pic : ${monthList(v.peakMonths)}` : v.isSeasonal ? "saisonnière" : "régulière toute l'année",
  );
  s.add("Prochain pic", demand.monthsToNextPeak, (m) => (m === 0 ? "ce mois-ci" : `dans ${formatInt(m)} mois`));
  s.add("Demande prévue sur les 12 prochains mois", demand.futureGrowthPct, (v) => `${formatPct(v, true)} par rapport aux 12 derniers`);
}

/** One line per metric across ad platforms (median only), to keep the sheet short. */
function channelLine(s: Section, label: string, channels: readonly ChannelCost[], pick: (c: ChannelCost) => Datum<Interval>): void {
  const known: { platform: string; d: Known<Interval> }[] = [];
  for (const channel of channels) {
    const d = pick(channel);
    const platform = PLATFORM_LABELS[channel.platform];
    if (isKnown(d)) known.push({ platform, d });
    else s.gap(`${label} ${platform}`, d.reason, d.missing);
  }
  if (known.length === 0) return;
  const values = known.map(({ platform, d }) => `${platform} ${money(d.value.p50)}`).join(", ");
  const kind = known.some(({ d }) => d.kind === "estimate") ? "estimate" : known[0].d.kind;
  s.lines.push(`- ${label} médian : ${values} ${s.tag(known.flatMap(({ d }) => d.sources), kind)}`);
}

function marketLines(c: CountryAnalysis, s: Section, currency: string, brief: boolean): void {
  s.add("Concurrence actuelle", c.competition.current, (v) => `${COMPETITION_LABELS[v.level].toLowerCase()} (indice ${formatInt(v.index)} sur 100)`);
  s.add("Concurrence à venir", c.competition.future, (v) => OUTLOOK_LABELS[v.outlook].toLowerCase());
  s.add("Commandes potentielles par mois", c.sales.monthlyOrders, (i) => interval(i, amount));
  if (brief) return;
  s.add("Chiffre d'affaires potentiel par an", c.sales.annualRevenue, (i) => interval(i, (v) => money(v, currency)));
  channelLine(s, "Coût par clic", c.advertising, (ch) => ch.cpc);
  channelLine(s, "Budget de test", c.advertising, (ch) => ch.testBudget);
}

function signalLines(c: CountryAnalysis, s: Section, brief: boolean): void {
  const v2 = c.signals;
  if (!v2) return;
  s.add("Marge au prix du marché, avant publicité", v2.marketMarginPct, (v) => formatPct(v));
  if (brief) return;
  s.add("Recherches associées (Google)", v2.searchSuggestions, (g) => {
    const shops = g.marketplaces.length > 0 ? `, marketplaces citées : ${g.marketplaces.slice(0, 3).map((m) => clean(m, 40)).join(", ")}` : "";
    return `${formatInt(g.suggestions.length)} suggestions, dont ${formatInt(g.intent.length)} avec une intention d'achat${shops}`;
  });
  s.add("Vidéos YouTube publiées sur 12 mois", v2.content, (v) => {
    const views = v.medianViews === null ? "" : `, vues médianes : ${formatInt(v.medianViews)}`;
    return `${formatInt(v.videosLast12Months)} (ordre de grandeur donné par YouTube)${views}`;
  });
  s.add("Annonces eBay", v2.marketplace, (m) => {
    const price = m.priceEur ? `, prix médian ${money(m.priceEur.median)} TTC` : "";
    const china = m.chinaShare === null ? "" : `, ${formatRatioPct(m.chinaShare)} expédiées de Chine`;
    return `${formatInt(m.listings)} annonces${price}${china}`;
  });
  s.add("Audience Wikipédia", v2.topicInterest, () => null);
  s.add("Taxes à l'import", v2.taxes, (t) => {
    const vat = t.vatRatePct === null ? "pas de TVA nationale" : `TVA ${formatPct(t.vatRatePct)}`;
    if (t.dutyRatePct === null) return vat;
    const { min, max } = t.dutyRatePct;
    return `${vat}, droit de douane ${min === max ? formatPct(min) : `de ${formatPct(min)} à ${formatPct(max)}`}`;
  });
  s.add("Prix de marché HT (médiane eBay)", v2.marketPriceExVatEur, (v) => money(v));
  s.add("Coût unitaire (achat et droits)", v2.unitCostEur, (v) => money(v));
}

function countrySection(c: CountryAnalysis, currency: string, flagMock: boolean, brief: boolean): Section {
  const { scoring } = c;
  const s = new Section(flagMock);
  s.lines.push(`- Décision actuelle : ${DECISION_LABELS[scoring.decision].toLowerCase()}`);
  s.add("Score d'opportunité", scoring.score, (v) => `${formatInt(v.total)} sur 100`);
  s.lines.push(`- Confiance : ${formatInt(scoring.confidence.score)} sur 100, ${CONFIDENCE_LABELS[scoring.confidence.level].toLowerCase()} [calcul]`);
  if (c.languageMismatch) s.lines.push("- Aucun terme de recherche dans une langue du pays.");
  demandLines(c, s, brief);
  marketLines(c, s, currency, brief);
  signalLines(c, s, brief);
  return s;
}

function assumptionLine(a: Assumption): string {
  const format = (v: number) => (a.unit === "ratio" ? formatRatioPct(v) : a.unit === "percent" ? formatPct(v) : amount(v));
  const d = a.distribution;
  const value = d.type === "fixed" ? format(d.value) : `entre ${format(d.min)} et ${format(d.max)}, valeur centrale ${format(d.mode)}`;
  return `- ${clean(a.label, 80)} : ${value} [hypothèse ; ${a.origin === "user" ? "saisie utilisateur" : "réglage par défaut"}]`;
}

function headerLines(analysis: AnalysisResult, flagMock: boolean, brief: boolean): string[] {
  const { economics } = analysis;
  const countries = analysis.countries.map((c) => `${getCountry(c.country).nameFr} (${c.country})`);
  const date = analysis.completedAt ?? analysis.createdAt;
  const typed = "[hypothèse ; saisie utilisateur]";
  const lines = [
    "# Fiche de faits de l'analyse",
    `Produit : « ${clean(analysis.product.displayName, MAX_NAME_LENGTH)} »`,
    `Analyse du ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(new Date(date))}`,
    analysis.dataMode === "mock"
      ? "Mode de données : fictif (mock de développement). Aucune valeur de cette fiche ne décrit le marché réel."
      : "Mode de données : réel (sources externes).",
    `Pays analysés (${formatInt(countries.length)}) : ${countries.join(", ")}`,
    economics.sellingPrice === undefined ? "- Prix de vente : non renseigné" : `- Prix de vente : ${money(economics.sellingPrice, economics.currency)} ${typed}`,
    economics.landedCost === undefined ? "- Coût de revient : non renseigné" : `- Coût de revient : ${money(economics.landedCost, economics.currency)} ${typed}`,
  ];
  const global = new Section(flagMock);
  global.add("Prix fournisseur AliExpress", analysis.sourcing, (o) => `médiane ${money(o.priceEur.median)} sur ${formatInt(o.sampled)} produits comparés`);
  global.add("Code douanier", analysis.classification, (h) =>
    // A searched code can be plainly wrong ("casquette" → "cap" → bottle caps): its description is left out so the
    // model cannot describe the product from it. A code typed by the user keeps its description.
    h.method === "search"
      ? `${clean(h.code, 14)}, proposé automatiquement par la recherche du tarif, à vérifier (il peut ne pas correspondre au produit)`
      : `${clean(h.code, 14)} (${clean(h.description, 120)})`,
  );
  lines.push(...global.lines);
  if (global.gaps.length > 0) lines.push("Données insuffisantes (DATA_INSUFFICIENT) :", ...gapLines(global.gaps));
  if (!brief && analysis.assumptions.length > 0) lines.push("Hypothèses de calcul :", ...analysis.assumptions.map(assumptionLine));
  return lines;
}

/** Compact French fact sheet of a stored analysis, and the numbers the AI may repeat. */
export function buildFactSheet(analysis: AnalysisResult, options: FactSheetOptions = {}): FactSheet {
  const brief = options.brief ?? false;
  const flagMock = analysis.dataMode !== "mock";
  const currency = analysis.economics.currency;
  const countries = analysis.countries.map((c) => ({ c, s: countrySection(c, currency, flagMock, brief) }));

  // Gaps shared by every country are written once, not once per country.
  const counts = new Map<string, number>();
  for (const { s } of countries) for (const key of new Set(s.gaps.map(gapKey))) counts.set(key, (counts.get(key) ?? 0) + 1);
  const shared = countries.length > 1 ? new Set([...counts].filter(([, n]) => n === countries.length).map(([key]) => key)) : new Set<string>();

  const sections = [headerLines(analysis, flagMock, brief)];
  const sharedGaps = countries[0]?.s.gaps.filter((g) => shared.has(gapKey(g))) ?? [];
  if (sharedGaps.length > 0) sections.push(["Données insuffisantes dans tous les pays (DATA_INSUFFICIENT) :", ...gapLines(sharedGaps)]);

  // Insertion order keeps the analysis order (a group sits where its first country is).
  const blocks = new Map<string, { names: string[]; body: string[] }>();
  for (const { c, s } of countries) {
    const body = [...s.lines];
    const own = s.gaps.filter((g) => !shared.has(gapKey(g)));
    if (own.length > 0) body.push("Données insuffisantes (DATA_INSUFFICIENT) :", ...gapLines(own));
    if (flagMock && c.scoring.confidence.mockTainted) body.push("Attention : des valeurs de ce pays viennent de données fictives (mock), sans rapport avec le marché réel.");
    const name = `${getCountry(c.country).nameFr} (${c.country})`;
    const key = options.groupSameCountries ? body.join("\n") : c.country;
    const block = blocks.get(key);
    if (block) block.names.push(name);
    else blocks.set(key, { names: [name], body });
  }
  for (const { names, body } of blocks.values()) {
    const heading = names.length === 1 ? `## ${names[0]}` : `## ${names.join(", ")} : mêmes faits pour chacun de ces pays`;
    sections.push([heading, ...body]);
  }

  // Plain spaces: Intl's narrow no-break spaces read worse for the model, and the guard treats them alike.
  const text = sections
    .map((lines) => lines.join("\n"))
    .join("\n\n")
    .replace(/[  ]/g, " ");
  return { text, numbers: collectNumbers(text) };
}
