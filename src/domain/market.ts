import type { Datum, Interval } from "./datum";
import type { YearMonth } from "./time";

// ---------- Demand ----------

export interface MonthlyPoint {
  readonly month: YearMonth;
  readonly value: number;
}

export type MonthlySeries = readonly MonthlyPoint[];

/**
 * absolute_volume: monthly searches (Keyword Planner) — comparable across countries.
 * relative_index:  0–100 interest index (Trends) — shape only, NOT a volume.
 * topic_interest:  Wikipedia pageviews of the category article, per language — shape of interest in the
 *                  category only, NOT searches and NOT per country. Last resort when Trends and Keyword Planner are absent.
 */
export type DemandBasis = "absolute_volume" | "relative_index" | "topic_interest";

export interface DemandHistory {
  readonly basis: DemandBasis;
  readonly series: MonthlySeries;
}

export type TrendDirection = "rising" | "stable" | "declining";

export interface TrendStats {
  /** Compound annual growth implied by the log-linear fit, in %. */
  readonly annualGrowthPct: number;
  readonly direction: TrendDirection;
  /** Goodness of fit of the trend, 0–1. */
  readonly r2: number;
  readonly monthsUsed: number;
}

export interface SeasonalityStats {
  /** 12 multiplicative factors (Jan→Dec), 1 = average month. */
  readonly monthlyIndex: readonly number[];
  readonly peakMonths: readonly number[];
  readonly troughMonths: readonly number[];
  /** (max − min) / mean of the monthly profile. */
  readonly amplitude: number;
  /** Share of detrended variance explained by the seasonal profile, 0–1. */
  readonly strength: number;
  readonly isSeasonal: boolean;
  readonly yearsUsed: number;
}

export interface ForecastPoint extends Interval {
  readonly month: YearMonth;
}

export interface DemandForecast {
  readonly basis: DemandBasis;
  readonly method: string;
  readonly points: readonly ForecastPoint[];
}

export interface DemandAnalysis {
  readonly history: Datum<DemandHistory>;
  readonly avgMonthlySearches: Datum<number>;
  readonly trend: Datum<TrendStats>;
  readonly seasonality: Datum<SeasonalityStats>;
  readonly forecast: Datum<DemandForecast>;
  /** Next 12 forecast months vs last 12 observed months, in % (P50 basis). */
  readonly futureGrowthPct: Datum<number>;
  /** Months until the next seasonal peak, 0 = current month. */
  readonly monthsToNextPeak: Datum<number>;
}

// ---------- Macro context ----------

export interface MarketContext {
  readonly population: Datum<number>;
  readonly gdpPerCapitaPpp: Datum<number>;
  readonly internetUsersPct: Datum<number>;
  readonly onlineBuyersPct: Datum<number>;
  readonly consumerConfidence: Datum<number>;
}

// ---------- Competition ----------

export interface WeeklyCount {
  /** ISO date (YYYY-MM-DD) of the Monday starting the week. */
  readonly weekStart: string;
  readonly count: number;
}

export interface AdActivity {
  readonly activeAds: number;
  readonly uniqueAdvertisers: number;
  /** New ads first delivered per week, when the source exposes start dates. */
  readonly newAdsByWeek: readonly WeeklyCount[];
}

export type CompetitionLevel = "low" | "moderate" | "high" | "very_high";

export interface CompetitionComponent {
  readonly id: "google_competition" | "meta_advertisers" | "tiktok_advertisers" | "marketplace_listings";
  readonly label: string;
  readonly normalized: number;
  readonly weight: number;
}

export interface CompetitionAssessment {
  /** 0 = no visible competition, 100 = saturated. */
  readonly index: number;
  readonly level: CompetitionLevel;
  readonly components: readonly CompetitionComponent[];
}

export type CompetitionOutlook = "decreasing" | "stable" | "increasing" | "surging";

export interface CompetitionProjection {
  readonly outlook: CompetitionOutlook;
  /** Monthly growth of newly launched ads implied by the fit, in %. */
  readonly monthlyGrowthPct: number;
  readonly weeksUsed: number;
}

export interface CompetitionAnalysis {
  readonly googleCompetitionIndex: Datum<number>;
  readonly meta: Datum<AdActivity>;
  readonly tiktok: Datum<AdActivity>;
  readonly current: Datum<CompetitionAssessment>;
  readonly future: Datum<CompetitionProjection>;
}

// ---------- Advertising & sales ----------

export type AdPlatform = "google" | "meta" | "tiktok";

export interface ChannelCost {
  readonly platform: AdPlatform;
  readonly cpc: Datum<Interval>;
  readonly cpa: Datum<Interval>;
  /** Budget to reach the target number of test conversions. */
  readonly testBudget: Datum<Interval>;
}

export interface SalesPotential {
  readonly monthlyOrders: Datum<Interval>;
  readonly annualOrders: Datum<Interval>;
  readonly annualRevenue: Datum<Interval>;
}
