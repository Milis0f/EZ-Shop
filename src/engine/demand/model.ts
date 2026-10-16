import { FORECAST_PARAMS } from "@/config/scoring";
import type { ForecastPoint, MonthlySeries } from "@/domain/market";
import { addMonths, monthOfYear, monthsBetween } from "@/domain/time";
import { variance, Z90 } from "../stats/descriptive";
import { ols, predictionStdError, type OlsFit } from "../stats/ols";

/**
 * Demand model on log1p(values), with t = calendar months since the first observed month
 * (a missing month leaves a gap in t, it never shifts the points that follow):
 *   log1p(y_t) = a + b·t + Σ_m s_m·[month(t) = m] + ε_t      (seasonal, ≥ 24 points)
 *   log1p(y_t) = a + b·t + ε_t                               (trend only, 12–23 points)
 * Limits: residuals assumed i.i.d. normal (autocorrelation ignored → intervals may be too narrow);
 * the trend is extrapolated linearly in logs.
 */

export const MODEL_METHOD = {
  seasonal: "log_linear_ols_monthly_dummies_v2",
  trendOnly: "log_linear_ols_trend_only_v2",
} as const;

export interface DemandModel {
  readonly kind: "seasonal" | "trend_only";
  readonly fit: OlsFit;
  /** Input sorted by month (a copy): `fit.residuals` is index-aligned with it. */
  readonly series: MonthlySeries;
  /** Months between the first and the last observed point. */
  readonly lastT: number;
  readonly design: (t: number, month: number) => number[];
}

const seasonalRow = (t: number, month: number): number[] => [
  1,
  t,
  ...Array.from({ length: 11 }, (_, i) => (month === i + 2 ? 1 : 0)),
];
const trendRow = (t: number): number[] => [1, t];

export function fitDemandModel(input: MonthlySeries): DemandModel | null {
  if (input.length < FORECAST_PARAMS.minMonthsForTrend) return null;
  const series = input.toSorted((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  const kind = series.length >= FORECAST_PARAMS.minMonthsForSeasonality ? "seasonal" : "trend_only";
  const design = kind === "seasonal" ? seasonalRow : (t: number) => trendRow(t);
  const origin = series[0].month;
  const x = series.map((p) => design(monthsBetween(origin, p.month), monthOfYear(p.month)));
  const y = series.map((p) => Math.log1p(Math.max(0, p.value)));
  const fit = ols(x, y);
  const lastT = monthsBetween(origin, series[series.length - 1].month);
  return fit ? { kind, fit, series, lastT, design } : null;
}

/** Compound annual growth implied by the slope, in %. */
export const annualGrowthPct = (model: DemandModel): number => (Math.exp(12 * model.fit.beta[1]) - 1) * 100;

export interface SeasonalProfile {
  readonly factors: readonly number[];
  readonly strength: number;
}

export function seasonalProfile(model: DemandModel): SeasonalProfile | null {
  if (model.kind !== "seasonal") return null;
  const coefs = [0, ...model.fit.beta.slice(2)];
  const raw = coefs.map((c) => Math.exp(c));
  const avg = raw.reduce((s, v) => s + v, 0) / 12;
  const factors = raw.map((v) => v / avg);

  // Hyndman's seasonal strength on the log scale: 1 − Var(R) / Var(S + R).
  const meanCoef = coefs.reduce((s, v) => s + v, 0) / 12;
  const seasonal = model.series.map((p) => coefs[monthOfYear(p.month) - 1] - meanCoef);
  const residuals = model.fit.residuals;
  const combined = seasonal.map((s, i) => s + residuals[i]);
  const denominator = variance(combined);
  const strength = denominator > 0 ? Math.max(0, 1 - variance(residuals) / denominator) : 0;
  return { factors, strength };
}

export function forecastPoints(model: DemandModel, horizon: number): ForecastPoint[] {
  const last = model.series[model.series.length - 1];
  return Array.from({ length: horizon }, (_, i) => {
    const h = i + 1;
    const month = addMonths(last.month, h);
    const x0 = model.design(model.lastT + h, monthOfYear(month));
    const center = x0.reduce((s, v, j) => s + v * model.fit.beta[j], 0);
    const se = predictionStdError(model.fit, x0);
    const back = (v: number) => Math.max(0, Math.expm1(v));
    return { month, p10: back(center - Z90 * se), p50: back(center), p90: back(center + Z90 * se) };
  });
}
