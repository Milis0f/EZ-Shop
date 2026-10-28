import { COUNTRIES, LANGUAGE_LABELS_FR, type CountryCode, type LanguageCode } from "@/domain/country";
import { MONTH_LABELS_FR } from "@/domain/time";
import { INTL_LOCALES, type Locale } from "@/i18n/config";
import { formatNumber, formatPct } from "@/i18n/format";
import { messagesFor, type Messages } from "@/i18n/messages";
import { plural, t } from "@/i18n/translate";
import { SOURCE_LABELS } from "@/lib/format";
import type { InterestFigure } from "./simple-summary";
import type { LabelRef, Reason, VerdictValue } from "./verdict";

/**
 * Display text of the report in one locale: verdict reasons from their codes, and the names (months,
 * countries, languages, sources, criteria) they mention. French reproduces the text printed before i18n.
 */

type ReportMessages = Messages<"report">;

const report = (locale: Locale): ReportMessages => messagesFor("report", locale);

const VERDICT_KEY = { oui: "yes", non: "no", surveiller: "watch" } as const;

/** The verdict word (OUI / YES / SÍ...). */
export const verdictWord = (value: VerdictValue, locale: Locale): string => messagesFor("common", locale).verdict[VERDICT_KEY[value]];

/** Abbreviated month name, 1 to 12. */
export function monthLabel(month: number, locale: Locale): string {
  if (locale === "fr") return MONTH_LABELS_FR[month - 1] ?? String(month);
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, month - 1, 15)));
}

export const monthList = (months: readonly number[], locale: Locale): string => months.map((m) => monthLabel(m, locale)).join(", ");

export function countryName(code: CountryCode, locale: Locale): string {
  if (locale === "fr") return COUNTRIES[code].nameFr;
  if (locale === "en") return COUNTRIES[code].nameEn;
  return new Intl.DisplayNames([INTL_LOCALES[locale]], { type: "region" }).of(code) ?? COUNTRIES[code].nameEn;
}

export function languageName(code: LanguageCode, locale: Locale): string {
  if (locale === "fr") return LANGUAGE_LABELS_FR[code];
  return new Intl.DisplayNames([INTL_LOCALES[locale]], { type: "language" }).of(code) ?? code;
}

const lookup = (table: Readonly<Record<string, string>>, id: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(table, id) ? table[id] : undefined;

export const sourceName = (id: string, locale: Locale): string =>
  lookup(report(locale).sources, id) ?? lookup(SOURCE_LABELS, id) ?? id;

/** A criterion or confidence factor by id; an id the dictionary does not know keeps the engine label. */
export const criterionLabel = (ref: LabelRef, locale: Locale): string => lookup(report(locale).criteria, ref.id) ?? ref.label;
export const factorLabel = (ref: LabelRef, locale: Locale): string => lookup(report(locale).confidenceFactors, ref.id) ?? ref.label;

const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);
/** Ends a sentence once: abbreviated month labels may already end with a full stop. */
const sentence = (text: string) => (text.endsWith(".") ? text : `${text}.`);

/** Unit prices keep their cents: a minimum price rounded up or down would be a different price. */
export const unitPrice = (v: number, locale: Locale, currency = "EUR"): string =>
  formatNumber(v, locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });

const roundPct = (v: number, locale: Locale, signed = false) => formatPct(Math.round(v), locale, { signed });

/** One verdict reason as a sentence in the locale. */
export function reasonText(reason: Reason, locale: Locale): string {
  const m = report(locale).verdict;
  const criteria = (list: readonly LabelRef[]) => list.map((r) => lower(criterionLabel(r, locale))).join(", ");
  switch (reason.code) {
    case "loss_at_planned_price":
      return t(m.lossAtPrice, { margin: roundPct(reason.marginPct, locale), basis: reason.dutyIncluded ? m.basisWithDuties : m.basisNoDuties });
    case "below_target_margin": {
      const excl = unitPrice(reason.exVatEur, locale);
      const price = reason.inclVatEur === null ? t(m.priceExVat, { excl }) : t(m.priceInclAndExVat, { incl: unitPrice(reason.inclVatEur, locale), excl });
      return t(m.belowTarget, { target: formatPct(reason.targetMarginPct, locale), price });
    }
    case "no_demand_data":
      return m.noDemandData;
    case "interest_trend": {
      const direction = reason.direction === "rising" ? m.trendRising : reason.direction === "declining" ? m.trendDeclining : m.trendStable;
      return t(m.trend, { direction, growth: roundPct(reason.annualGrowthPct, locale, true), wiki: reason.fromWikipedia ? m.trendFromWikipedia : "" });
    }
    case "seasonal_peak":
      return sentence(t(m.peak, { months: monthList(reason.months, locale) }));
    case "steady_demand":
      return m.steadyDemand;
    case "no_related_searches":
      return m.noRelatedSearches;
    case "buying_searches":
      return plural(locale, reason.count, { one: m.buyingSearchesOne, other: m.buyingSearchesOther }, { total: reason.total });
    case "marketplace_searches":
      return t(reason.count > 1 ? m.marketplaceOther : m.marketplaceOne, { name: reason.first });
    case "margin_at_price":
      return t(m.marginAtPrice, { margin: roundPct(reason.marginPct, locale) });
    case "strongest_signals":
      return t(m.strongestSignals, { list: criteria(reason.criteria) });
    case "above_thresholds":
      return m.aboveThresholds;
    case "weakest_criteria":
      return t(m.weakestCriteria, { list: criteria(reason.criteria) });
    case "below_threshold":
      return m.belowThreshold;
    case "mixed_signals":
      return reason.best && reason.worst
        ? t(m.mixedSignals, { best: criteria([reason.best]), worst: criteria([reason.worst]) })
        : m.mixedSignalsShort;
    case "low_confidence":
      return reason.factor ? t(m.lowConfidence, { factor: lower(factorLabel(reason.factor, locale)) }) : m.lowConfidenceShort;
    case "insufficient_data":
      return reason.sources.length > 0
        ? t(m.insufficientData, { list: reason.sources.map((id) => sourceName(id, locale)).join(", ") })
        : m.insufficientDataShort;
  }
}

/** What the interest figure counts, for the label under it. */
export function interestLabel(interest: InterestFigure, locale: Locale): string {
  const m = report(locale).figures;
  if (interest.direct) return m.interestSearches;
  return interest.article === null ? m.interestWikiCategory : t(m.interestWikiArticle, { article: interest.article });
}
