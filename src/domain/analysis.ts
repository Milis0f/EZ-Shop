import type { Assumption } from "./assumption";
import type { CountryCode, CurrencyCode } from "./country";
import type { ChannelCost, CompetitionAnalysis, DemandAnalysis, MarketContext, SalesPotential } from "./market";
import type { ProductQuery, ProductTerm } from "./product";
import type { ProviderId } from "./provenance";
import type { Datum } from "./datum";
import type { ScoredCountry } from "./scoring";
import type { AnalysisInput } from "./schemas";
import type { CountrySignalsV2, HsClassification, SourcingOffer } from "./signals";

export const ANALYSIS_SCHEMA_VERSION = 1;

export type DataMode = "live" | "mock";

export type AnalysisStatus = "running" | "completed" | "failed";

export type ProviderState = "ready" | "not_configured" | "not_implemented" | "mock";

/** Snapshot of a provider's state at analysis time, for the audit trail. */
export interface ProviderStatusSnapshot {
  readonly providerId: ProviderId;
  readonly state: ProviderState;
  readonly detail: string;
}

/** Non-fatal collection issue (missing key, unsupported country, upstream error). */
export interface CollectionIssue {
  readonly providerId: ProviderId;
  readonly code: string;
  readonly message: string;
}

export interface UnitEconomics {
  readonly currency: CurrencyCode;
  readonly sellingPrice?: number;
  readonly landedCost?: number;
}

export interface CountryAnalysis {
  readonly country: CountryCode;
  readonly terms: readonly ProductTerm[];
  /** True when no term exists in any language of the country. */
  readonly languageMismatch: boolean;
  readonly demand: DemandAnalysis;
  readonly market: MarketContext;
  readonly competition: CompetitionAnalysis;
  readonly advertising: readonly ChannelCost[];
  readonly sales: SalesPotential;
  readonly scoring: ScoredCountry;
  readonly issues: readonly CollectionIssue[];
  readonly dataGaps: readonly string[];
  /** Data sources v2 (absent from analyses stored before 2026-10-15). */
  readonly signals?: CountrySignalsV2;
}

export interface AnalysisResult {
  readonly schemaVersion: typeof ANALYSIS_SCHEMA_VERSION;
  readonly id: string;
  readonly status: AnalysisStatus;
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly error?: string;
  readonly dataMode: DataMode;
  readonly input: AnalysisInput;
  readonly product: ProductQuery;
  readonly economics: UnitEconomics;
  readonly assumptions: readonly Assumption[];
  readonly providers: readonly ProviderStatusSnapshot[];
  readonly countries: readonly CountryAnalysis[];
  readonly modelVersion: string;
  /** Data sources v2, analysis level (absent from analyses stored before 2026-10-15). */
  readonly sourcing?: Datum<SourcingOffer>;
  readonly classification?: Datum<HsClassification>;
}

/** Analysis-level data stored next to the analysis (sources v2). */
export interface AnalysisContext {
  readonly sourcing?: Datum<SourcingOffer>;
  readonly classification?: Datum<HsClassification>;
}

export interface AnalysisSummary {
  readonly id: string;
  readonly productName: string;
  readonly status: AnalysisStatus;
  readonly dataMode: DataMode;
  readonly countryCount: number;
  readonly createdAt: string;
  /** Best country by score, if any country could be scored. */
  readonly topCountry?: { readonly code: CountryCode; readonly score: number; readonly confidence: number };
}
