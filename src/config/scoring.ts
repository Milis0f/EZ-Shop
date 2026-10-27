/**
 * Scoring model configuration. Every change to weights, bounds or thresholds
 * must bump SCORING_MODEL_VERSION so stored scores remain auditable.
 *
 * Bounds are modelling choices (assumptions), not observed facts. They are
 * absolute — a country's score does not depend on which other countries are compared.
 */

export const SCORING_MODEL_VERSION = "2026.10-v3";

export const CRITERION_IDS = [
  "demand_volume",
  "demand_trend",
  "demand_outlook",
  "seasonality_timing",
  "search_intent",
  "video_interest",
  "competition_current",
  "competition_trend",
  "ad_cost",
  "market_context",
  "unit_economics",
  "market_margin",
] as const;

export type CriterionId = (typeof CRITERION_IDS)[number];

/** Points out of 100. Must sum to 100 (asserted by tests). */
export const CRITERION_WEIGHTS: Readonly<Record<CriterionId, number>> = {
  demand_volume: 15,
  demand_trend: 10,
  demand_outlook: 5,
  seasonality_timing: 5,
  search_intent: 8,
  video_interest: 5,
  competition_current: 12,
  competition_trend: 3,
  ad_cost: 7,
  market_context: 8,
  unit_economics: 10,
  market_margin: 12,
};

export const SCORING_POLICY = {
  /** Below this share of weight backed by data, no total score is produced. */
  minCoverage: 0.5,
  /**
   * At least one of these must be scored, otherwise DATA_INSUFFICIENT. Indirect demand signals
   * (suggestions, videos) count: their low source quality already lowers the confidence.
   */
  requiredAnyOf: ["demand_volume", "demand_trend", "search_intent", "video_interest"] as readonly CriterionId[],
  /** Cap applied when the estimated CPA exceeds the unit margin. */
  negativeEconomicsCap: 35,
} as const;

export const NORMALIZATION_BOUNDS = {
  /** log10 of avg monthly searches: 100 → 0, 100 000 → 1. */
  demandVolumeLog10: { min: 2, max: 5 },
  annualGrowthPct: { min: -30, max: 50 },
  futureGrowthPct: { min: -20, max: 30 },
  /** Google CPC P50 in account currency: 0.10 → best, 5.00 → worst. */
  cpcLog10: { min: Math.log10(0.1), max: Math.log10(5) },
  gdpPerCapitaPppLog10: { min: Math.log10(5_000), max: Math.log10(100_000) },
  /** CPA P50 / unit margin: ≤ 0.3 → best, ≥ 1.2 → worst. */
  cpaToMargin: { best: 0.3, worst: 1.2 },
  /** log10 of unique advertisers: 1 → 0, 500 → 1. */
  advertisersLog10: { min: 0, max: Math.log10(500) },
  /** Autocomplete: distinct suggestions (0 → 0, 10 → 1) and purchase-intent suggestions (0 → 0, 3 → 1). */
  suggestionCount: { min: 0, max: 10 },
  intentSuggestionCount: { min: 0, max: 3 },
  /** log10 of matching eBay listings on the national site: 10 → 0, 50 000 → 1 (competition). */
  marketplaceListingsLog10: { min: 1, max: Math.log10(50_000) },
} as const;

/** Market-context sub-weights (renormalized over available indicators). */
export const MARKET_CONTEXT_WEIGHTS = {
  gdpPerCapitaPpp: 0.5,
  internetUsersPct: 0.25,
  onlineBuyersPct: 0.25,
} as const;

/**
 * Launch-timing heuristic: launching 1–3 months before the seasonal peak leaves time
 * to test and scale. Non-seasonal demand gets a neutral score.
 */
export const SEASONALITY_TIMING_SCORES = {
  notSeasonal: 0.7,
  idealWindow: 1, // 1–3 months before peak
  atPeak: 0.6, // peak is the current month
  midWindow: 0.6, // 4–6 months before peak
  farFromPeak: 0.3,
} as const;

export const COMPETITION_WEIGHTS = {
  google_competition: 0.35,
  meta_advertisers: 0.25,
  tiktok_advertisers: 0.2,
  marketplace_listings: 0.2,
} as const;

export const COMPETITION_OUTLOOK_SCORE = {
  decreasing: 1,
  stable: 0.6,
  increasing: 0.3,
  surging: 0,
} as const;

export const DECISION_THRESHOLDS = {
  prioritizeScore: 65,
  prioritizeConfidence: 60,
  testScore: 50,
  /** Below this confidence, the result is exploratory only. */
  minConfidence: 40,
} as const;

export const CONFIDENCE_PARAMS = {
  /** Latest demand/competition data younger than this keeps full freshness. */
  freshFullDays: 62,
  /** Age at which freshness reaches 0.5. */
  freshHalfDays: 365,
  staleFloor: 0.3,
  /** Consistency factor when only one demand source exists (no cross-check possible). */
  singleSourceConsistency: 0.7,
  /** Consistency factor when demand rests on indirect signals only (suggestions, Wikipedia, videos): no volume to cross-check. */
  indirectOnlyConsistency: 0.5,
} as const;

export const FORECAST_PARAMS = {
  horizonMonths: 12,
  /** Seasonality and seasonal forecasts need at least two full cycles. */
  minMonthsForSeasonality: 24,
  minMonthsForTrend: 12,
  /** Seasonal strength above which the series is considered seasonal. */
  seasonalStrengthThreshold: 0.3,
  /** |annual growth| below this is "stable". */
  stableGrowthPct: 5,
} as const;

export const COMPETITION_TREND_PARAMS = {
  minWeeks: 8,
  stableMonthlyGrowthPct: 3,
  surgingMonthlyGrowthPct: 15,
} as const;

export const SIMULATION_PARAMS = {
  samples: 5_000,
} as const;
