import type { AssumptionSet } from "@/domain/assumption";
import type { CollectionIssue, CountryAnalysis, UnitEconomics } from "@/domain/analysis";
import type { CountryCode, LanguageCode } from "@/domain/country";
import { collectMissing, isKnown, mapDatum, type Datum } from "@/domain/datum";
import type { OriginCode } from "@/domain/origin";
import type { CountrySignalsV2, SourcingOffer, TopicInterest } from "@/domain/signals";
import type { ProductTerm } from "@/domain/product";
import type {
  AdActivityObservation,
  AdCostObservation,
  ContentObservation,
  KeywordMetrics,
  ListingsObservation,
  SuggestionsObservation,
  TariffDuties,
  TermInterestSeries,
  TopicInterestObservation,
  VatRate,
} from "@/providers/contracts";
import type { FxRates } from "@/providers/contracts";
import { createRng } from "@/lib/random";
import { baseUnitCost, countryMargin, userValue } from "./economics/market-margin";
import { readContent, readMarketplace, readSuggestions } from "./signals/indirect";
import { computeImportTaxes } from "./taxes/import-taxes";
import { analyzeCompetition } from "./competition/analyze";
import { analyzeDemand } from "./demand/analyze";
import { estimateAdCosts } from "./economics/ad-costs";
import { estimateSales } from "./economics/sales";
import { buildMarketContext, type MacroSignals } from "./market/context";
import { assessConfidence, decide } from "./scoring/confidence";
import { scoreCountry, type ScoringOptions } from "./scoring/engine";

/** Everything collected for one country, already wrapped as Datum (no raw provider results). */
export interface CountrySignals {
  readonly country: CountryCode;
  readonly terms: readonly ProductTerm[];
  readonly languageMismatch: boolean;
  readonly keywordMetrics: Datum<readonly KeywordMetrics[]>;
  readonly searchInterest: Datum<readonly TermInterestSeries[]>;
  readonly adActivity: { readonly meta: Datum<AdActivityObservation>; readonly tiktok: Datum<AdActivityObservation> };
  readonly adCosts: { readonly meta: Datum<AdCostObservation>; readonly tiktok: Datum<AdCostObservation> };
  readonly macro: MacroSignals;
  /** Language of the terms used for this country. */
  readonly language: LanguageCode;
  /** Data sources v2, raw. */
  readonly v2: {
    readonly suggestions: Datum<SuggestionsObservation>;
    readonly content: Datum<ContentObservation>;
    readonly listings: Datum<ListingsObservation>;
    readonly topicInterest: Datum<TopicInterestObservation>;
    /** Tariff of the destination's regime; null where no tariff applies (CH, CA, AU). */
    readonly duties: Datum<TariffDuties> | null;
    readonly vat: Datum<VatRate>;
  };
  readonly issues: readonly CollectionIssue[];
}

export interface AnalyzeCountryOptions {
  readonly assumptions: AssumptionSet;
  readonly economics: UnitEconomics;
  readonly now: Date;
  /** Seed for Monte Carlo draws — same seed, same estimates. */
  readonly seed: string;
  readonly qualityOf: (sourceId: string) => number | undefined;
  readonly scoring?: ScoringOptions;
  /** Analysis-level data (sources v2). Absent → v2 signals are computed from the country data only. */
  readonly global?: {
    readonly fx: Datum<FxRates>;
    readonly sourcing: Datum<SourcingOffer>;
    readonly origin?: OriginCode;
  };
}

const NO_GLOBAL = { reason: "Données globales de l'analyse indisponibles.", missing: [] as string[] };

/** v2 block: indirect signals, import taxes and margin at market price for one country. */
function analyzeSignalsV2(signals: CountrySignals, options: AnalyzeCountryOptions): CountrySignalsV2 {
  const { v2 } = signals;
  const fx: Datum<FxRates> = options.global?.fx ?? { status: "DATA_INSUFFICIENT", ...NO_GLOBAL };
  const sourcing: Datum<SourcingOffer> = options.global?.sourcing ?? { status: "DATA_INSUFFICIENT", ...NO_GLOBAL };
  const collectedAt = options.now.toISOString();

  const searchSuggestions = readSuggestions(v2.suggestions, signals.language);
  const content = readContent(v2.content, options.now);
  const marketplace = readMarketplace(v2.listings, fx);
  const topicInterest = mapDatum<TopicInterestObservationLike, TopicInterest>(v2.topicInterest, ({ language, article, wikidataId, points }) => ({ language, article, wikidataId, points }));

  const base = baseUnitCost(options.economics, sourcing, collectedAt);
  const { sellingPrice } = options.economics;
  const customsValue =
    sellingPrice !== undefined
      ? { eur: sellingPrice, label: "prix de vente HT saisi", input: userValue(sellingPrice, "selling_price", collectedAt) }
      : isKnown(base.datum)
        ? { eur: base.datum.value, label: base.label, input: base.datum }
        : null;
  const taxes = computeImportTaxes({ country: signals.country, origin: options.global?.origin, duties: v2.duties, vat: v2.vat, fx, customsValue });
  const margin = countryMargin(base.datum, taxes, marketplace);

  return { searchSuggestions, content, marketplace, topicInterest, taxes, ...margin };
}

type TopicInterestObservationLike = { readonly language: string; readonly article: string; readonly wikidataId: string; readonly points: TopicInterest["points"] };

/** Pure: signals in, fully explained country analysis out. */
export function analyzeCountry(signals: CountrySignals, options: AnalyzeCountryOptions): CountryAnalysis {
  const rng = createRng(`${options.seed}|${signals.country}`);
  const v2 = analyzeSignalsV2(signals, options);
  const { analysis: demand, crossSourceCorrelation } = analyzeDemand(
    { keywordMetrics: signals.keywordMetrics, searchInterest: signals.searchInterest, topicInterest: signals.v2.topicInterest },
    options.now,
  );
  const competition = analyzeCompetition({
    keywordMetrics: signals.keywordMetrics,
    meta: signals.adActivity.meta,
    tiktok: signals.adActivity.tiktok,
    marketplace: v2.marketplace,
  });
  const advertising = estimateAdCosts(
    { keywordMetrics: signals.keywordMetrics, meta: signals.adCosts.meta, tiktok: signals.adCosts.tiktok },
    options.assumptions,
    rng,
  );
  const sales = estimateSales(demand.forecast, options.assumptions, options.economics.sellingPrice, rng);
  const market = buildMarketContext(signals.macro);

  const { score, evaluated } = scoreCountry(
    {
      demand,
      competition,
      advertising,
      market,
      economics: options.economics,
      signals: { searchSuggestions: v2.searchSuggestions, content: v2.content, unitCostEur: v2.unitCostEur, marketMarginPct: v2.marketMarginPct },
    },
    options.scoring,
  );
  const demandSources: ReadonlyArray<Datum<unknown>> = [signals.keywordMetrics, signals.searchInterest];
  const demandSourceCount = demandSources.filter((d) => isKnown(d)).length;
  const indirectDemandSignals = [isKnown(v2.searchSuggestions), isKnown(v2.content), isKnown(signals.v2.topicInterest)].filter(Boolean).length;
  const confidence = assessConfidence({
    evaluated,
    crossSourceCorrelation,
    demandSourceCount,
    indirectDemandSignals,
    qualityOf: options.qualityOf,
    now: options.now,
  });

  const dataGaps = collectMissing(
    signals.keywordMetrics,
    signals.searchInterest,
    signals.adActivity.meta,
    signals.adActivity.tiktok,
    signals.adCosts.meta,
    signals.adCosts.tiktok,
    ...Object.values(market),
    v2.searchSuggestions,
    v2.content,
    v2.marketplace,
    v2.taxes,
    v2.marketMarginPct,
  ).concat(signals.languageMismatch ? ["translated_terms"] : []);

  return {
    country: signals.country,
    terms: signals.terms,
    languageMismatch: signals.languageMismatch,
    demand,
    market,
    competition,
    advertising,
    sales,
    scoring: { score, criteria: evaluated.map((e) => e.result), confidence, decision: decide(score, confidence) },
    issues: signals.issues,
    dataGaps: [...new Set(dataGaps)],
    signals: v2,
  };
}
