import type { ProviderState } from "@/domain/analysis";
import type { CountryCode, LanguageCode } from "@/domain/country";
import type { AdActivity, AdPlatform, MonthlyPoint } from "@/domain/market";
import type { ProviderId, SourceRef } from "@/domain/provenance";
import type { YearMonth } from "@/domain/time";

/**
 * Adapter contracts. One interface per capability, so the engine depends on
 * what a source can provide — never on a vendor SDK or response format.
 */

export type ProviderCategory =
  | "search_demand"
  | "keyword_metrics"
  | "ad_library"
  | "ad_cost"
  | "macro"
  | "search_signals"
  | "content"
  | "marketplace"
  | "sourcing"
  | "customs"
  | "reference";

/**
 * - live_verified:         request/response mapping checked against the live API
 * - documented_unverified: written from official docs, never run with real credentials
 * - not_implemented:       contract only; returns `not_implemented`
 */
export type VerificationLevel = "live_verified" | "documented_unverified" | "not_implemented";

export type ProviderCoverage =
  | { readonly kind: "all" }
  | { readonly kind: "list"; readonly countries: readonly CountryCode[]; readonly note: string };

export interface ProviderMeta {
  readonly id: ProviderId;
  readonly name: string;
  readonly category: ProviderCategory;
  readonly authMode: "none" | "api_key" | "oauth" | "token";
  readonly access: "open" | "account" | "approval";
  readonly docsUrl: string;
  /** Reliability weight used by the confidence engine, 0–1. */
  readonly qualityTier: number;
  readonly connectorVersion: string;
  readonly requiredEnv: readonly string[];
  readonly coverage: ProviderCoverage;
  readonly verification: VerificationLevel;
  readonly notes: readonly string[];
  /** Public endpoint not documented as an API by its owner: may change or stop without notice. */
  readonly unofficial?: boolean;
}

export interface ProviderStatus {
  readonly state: ProviderState;
  readonly detail: string;
}

/** Connectors whose saved credentials can be tried against the real API from the settings form. */
export interface ConnectionTestable {
  diagnose(now: Date): Promise<ConnectionCheckStep[]>;
}

/** One step of a live credentials check (settings form "Tester la connexion"). */
export interface ConnectionCheckStep {
  readonly id: string;
  readonly label: string;
  readonly status: "ok" | "error" | "skipped";
  readonly detail: string;
  /** Individual problems, when a step found several. */
  readonly items?: readonly string[];
}

export interface DataProvider {
  readonly meta: ProviderMeta;
  status(): ProviderStatus;
}

export type ProviderErrorCode =
  | "not_configured"
  | "not_implemented"
  | "unsupported_country"
  | "no_data"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "upstream_error"
  | "invalid_response";

export interface ProviderError {
  readonly code: ProviderErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export type ProviderResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ProviderError };

export const ok = <T>(data: T): ProviderResult<T> => ({ ok: true, data });

export const fail = <T = never>(code: ProviderErrorCode, message: string, retryable = false): ProviderResult<T> => ({
  ok: false,
  error: { code, message, retryable },
});

export function isCovered(meta: ProviderMeta, country: CountryCode): boolean {
  return meta.coverage.kind === "all" || meta.coverage.countries.includes(country);
}

// ---------- Search demand (Google Trends) ----------

export interface SearchInterestQuery {
  readonly terms: readonly string[];
  readonly country: CountryCode;
  readonly from: YearMonth;
  readonly to: YearMonth;
}

/** 0–100 relative interest index — a shape, never a volume. */
export interface TermInterestSeries {
  readonly term: string;
  readonly points: readonly MonthlyPoint[];
  readonly source: SourceRef;
}

export interface SearchInterestProvider extends DataProvider {
  getInterestOverTime(query: SearchInterestQuery): Promise<ProviderResult<readonly TermInterestSeries[]>>;
}

// ---------- Keyword metrics (Google Ads Keyword Planner) ----------

export interface KeywordMetricsQuery {
  readonly terms: readonly string[];
  readonly country: CountryCode;
  readonly language: LanguageCode;
  readonly from: YearMonth;
  readonly to: YearMonth;
}

export interface KeywordMetrics {
  readonly term: string;
  readonly avgMonthlySearches: number | null;
  readonly monthlyVolumes: readonly MonthlyPoint[];
  /** Google Ads competition index, 0–100. */
  readonly competitionIndex: number | null;
  /** Top-of-page bid range, in account currency units. */
  readonly lowTopOfPageBid: number | null;
  readonly highTopOfPageBid: number | null;
  readonly currency: string;
  readonly source: SourceRef;
}

export interface KeywordMetricsProvider extends DataProvider {
  getKeywordMetrics(query: KeywordMetricsQuery): Promise<ProviderResult<readonly KeywordMetrics[]>>;
}

// ---------- Ad libraries (Meta, TikTok) ----------

export interface AdActivityQuery {
  readonly terms: readonly string[];
  readonly country: CountryCode;
  /** ISO date; ads first delivered before this are only counted if still active. */
  readonly since: string;
}

export interface AdActivityObservation extends AdActivity {
  readonly source: SourceRef;
  /** True when pagination limits stopped collection early (counts are lower bounds). */
  readonly truncated: boolean;
}

export interface AdLibraryProvider extends DataProvider {
  readonly platform: Exclude<AdPlatform, "google">;
  getAdActivity(query: AdActivityQuery): Promise<ProviderResult<AdActivityObservation>>;
}

// ---------- Ad cost estimates (Meta Marketing API, TikTok API for Business) ----------

export interface AdCostQuery {
  readonly terms: readonly string[];
  readonly country: CountryCode;
}

export interface AdCostObservation {
  readonly metric: "cpm" | "cpc";
  readonly low: number;
  readonly high: number;
  readonly currency: string;
  readonly source: SourceRef;
}

export interface AdCostProvider extends DataProvider {
  readonly platform: Exclude<AdPlatform, "google">;
  getCostEstimate(query: AdCostQuery): Promise<ProviderResult<AdCostObservation>>;
}

// ---------- Macro indicators (World Bank, Eurostat, OECD) ----------

export type MacroIndicatorId =
  | "population"
  | "gdp_per_capita_ppp"
  | "internet_users_pct"
  | "online_buyers_pct"
  | "consumer_confidence";

export interface MacroObservation {
  readonly country: CountryCode;
  readonly indicator: MacroIndicatorId;
  readonly value: number;
  readonly source: SourceRef;
}

export interface MacroBatch {
  readonly observations: readonly MacroObservation[];
  /** Sub-requests that failed while others succeeded — surfaced, never swallowed. */
  readonly partialErrors: readonly ProviderError[];
}

export interface MacroIndicatorProvider extends DataProvider {
  readonly indicators: readonly MacroIndicatorId[];
  /** Batched: one call covers every requested country. */
  getIndicators(countries: readonly CountryCode[]): Promise<ProviderResult<MacroBatch>>;
}

// ---------- Data sources v2: indirect signals, sourcing, customs ----------

export interface CountryTermsQuery {
  readonly terms: readonly string[];
  readonly country: CountryCode;
  readonly language: LanguageCode;
}

/** Google Autocomplete: what people type after the product name, per country. */
export interface SuggestionsObservation {
  readonly suggestions: readonly string[];
  readonly source: SourceRef;
}

export interface SuggestProvider extends DataProvider {
  getSuggestions(query: CountryTermsQuery): Promise<ProviderResult<SuggestionsObservation>>;
}

/** YouTube: videos about the product published for a country over a period. */
export interface ContentQuery extends CountryTermsQuery {
  /** ISO timestamp: only videos published after it are counted. */
  readonly publishedAfter: string;
}

export interface ContentObservation {
  readonly totalResults: number;
  readonly videos: ReadonlyArray<{ readonly id: string; readonly publishedAt: string; readonly views: number | null }>;
  readonly source: SourceRef;
}

export interface ContentProvider extends DataProvider {
  getContent(query: ContentQuery): Promise<ProviderResult<ContentObservation>>;
}

/** eBay: listings on the country's national site. Prices stay in the site currency here. */
export interface ListingsObservation {
  readonly marketplaceId: string;
  readonly total: number;
  readonly prices: ReadonlyArray<{ readonly value: number; readonly currency: string }>;
  /** Matching listings located in China (separate filtered count), when available. */
  readonly chinaTotal: number | null;
  readonly source: SourceRef;
}

export interface MarketplaceProvider extends DataProvider {
  getListings(query: CountryTermsQuery): Promise<ProviderResult<ListingsObservation>>;
}

/** Wikipedia: monthly pageviews of the article that best matches the product, per language edition. */
export interface TopicInterestQuery {
  /** Search terms, most specific first; English terms help the Wikidata match. */
  readonly terms: readonly string[];
  readonly language: LanguageCode;
  readonly from: YearMonth;
  readonly to: YearMonth;
  /** Wikidata concept resolved once per analysis: gives the article of the same concept in every language. */
  readonly wikidataId?: string;
}

export interface TopicEntity {
  readonly wikidataId: string;
  /** Article found in the input language. */
  readonly article: string;
  /** English label of the concept, when Wikidata has one. */
  readonly englishLabel: string | null;
}

export interface TopicInterestObservation {
  readonly language: LanguageCode;
  readonly article: string;
  readonly wikidataId: string;
  readonly points: readonly MonthlyPoint[];
  readonly source: SourceRef;
}

export interface TopicInterestProvider extends DataProvider {
  getTopicInterest(query: TopicInterestQuery): Promise<ProviderResult<TopicInterestObservation>>;
  /** Wikipedia article and Wikidata concept matching the terms, with its English label ("sock" for "chaussettes"). */
  resolveEntity(terms: readonly string[], language: LanguageCode): Promise<ProviderResult<TopicEntity>>;
}

/** AliExpress: what the product costs to source, and how much it sells there. */
export interface SourcingQuery {
  readonly terms: readonly string[];
  /** Destination used for availability and price ("ship_to_country"). */
  readonly shipTo: CountryCode;
}

export interface SourcingObservation {
  readonly totalProducts: number;
  readonly products: ReadonlyArray<{
    readonly title: string;
    readonly price: number;
    readonly currency: string;
    readonly orders: number | null;
    readonly rating: number | null;
    readonly url: string;
  }>;
  readonly source: SourceRef;
}

export interface SourcingProvider extends DataProvider {
  searchProducts(query: SourcingQuery): Promise<ProviderResult<SourcingObservation>>;
}

/** Customs tariffs. `regime` is the tariff applied by the destination. */
export type TariffRegime = "eu" | "gb" | "us";

export interface ClassificationCandidate {
  readonly code: string;
  readonly description: string;
}

export interface TariffDuties {
  readonly regime: TariffRegime;
  readonly code: string;
  /** Ad valorem duty for the origin (preference when one exists for it, else third-country / general rate), %. */
  readonly ratePctMin: number;
  readonly ratePctMax: number;
  /** Flat duty per item on low-value consignments (EU), in EUR. */
  readonly lowValueFlatEur: number | null;
  /** Other measures found for this origin that are not computed (anti-dumping, chapter 99…), described. */
  readonly otherMeasures: readonly string[];
  /** How the rate was chosen (preference applied, lines covered…), in plain French. */
  readonly notes: readonly string[];
  readonly source: SourceRef;
}

export interface TariffProvider extends DataProvider {
  readonly regimes: readonly TariffRegime[];
  /** Proposes commodity codes for an English description. Providers without search return not_implemented. */
  classify(description: string): Promise<ProviderResult<readonly ClassificationCandidate[]>>;
  getDuties(regime: TariffRegime, code: string, origin: string): Promise<ProviderResult<TariffDuties>>;
}

/** Standard VAT / GST rates by destination country. */
export interface VatRate {
  readonly country: CountryCode;
  /** Null when the country has no national VAT (United States). */
  readonly standardRatePct: number | null;
  readonly note?: string;
  readonly source: SourceRef;
}

export interface VatProvider extends DataProvider {
  getVatRates(countries: readonly CountryCode[]): Promise<ProviderResult<readonly VatRate[]>>;
}

/** Machine translation of the product name into a market's language. */
export interface TranslationProvider extends DataProvider {
  translate(text: string, from: LanguageCode, to: LanguageCode): Promise<ProviderResult<{ readonly text: string; readonly match: number }>>;
}

/** Reference exchange rates: 1 EUR = rate × currency. */
export interface FxRates {
  readonly date: string;
  readonly rates: Readonly<Record<string, number>>;
  readonly source: SourceRef;
}

export interface FxProvider extends DataProvider {
  getEurRates(): Promise<ProviderResult<FxRates>>;
}
