import { FORECAST_PARAMS } from "@/config/scoring";
import { derived, estimate, insufficient, isKnown, type Datum, type Known } from "@/domain/datum";
import type { DemandAnalysis, DemandForecast, DemandHistory, SeasonalityStats, TrendStats } from "@/domain/market";
import { monthOfYear, toYearMonth } from "@/domain/time";
import { sum } from "../stats/descriptive";
import { round } from "../stats/normalize";
import { buildDemandHistory, type DemandInputs } from "./history";
import { annualGrowthPct, fitDemandModel, forecastPoints, MODEL_METHOD, seasonalProfile, type DemandModel } from "./model";

export interface DemandResult {
  readonly analysis: DemandAnalysis;
  readonly crossSourceCorrelation: number | null;
}

function trendStats(model: DemandModel): TrendStats {
  const growth = annualGrowthPct(model);
  const stable = FORECAST_PARAMS.stableGrowthPct;
  return {
    annualGrowthPct: round(growth, 1),
    direction: growth > stable ? "rising" : growth < -stable ? "declining" : "stable",
    r2: round(model.fit.r2, 3),
    monthsUsed: model.series.length,
  };
}

function seasonalityStats(model: DemandModel): SeasonalityStats | null {
  const profile = seasonalProfile(model);
  if (!profile) return null;
  const { factors, strength } = profile;
  const max = Math.max(...factors);
  const min = Math.min(...factors);
  const months = (pick: (f: number) => boolean) => factors.flatMap((f, i) => (pick(f) ? [i + 1] : []));
  return {
    monthlyIndex: factors.map((f) => round(f, 3)),
    peakMonths: months((f) => f >= max - 0.03),
    troughMonths: months((f) => f <= min + 0.03),
    amplitude: round(max - min, 3),
    strength: round(strength, 3),
    isSeasonal: strength >= FORECAST_PARAMS.seasonalStrengthThreshold,
    yearsUsed: Math.floor(model.series.length / 12),
  };
}

export function analyzeDemand(inputs: DemandInputs, now: Date): DemandResult {
  const { history, avgMonthlySearches, crossSourceCorrelation } = buildDemandHistory(inputs);
  const none = (reason: string) => insufficient(reason, isKnown(history) ? [] : history.missing);

  if (!isKnown(history)) {
    const reason = "Aucun historique de demande exploitable.";
    return {
      analysis: {
        history,
        avgMonthlySearches,
        trend: none(reason),
        seasonality: none(reason),
        forecast: none(reason),
        futureGrowthPct: none(reason),
        monthsToNextPeak: none(reason),
      },
      crossSourceCorrelation,
    };
  }

  const model = fitDemandModel(history.value.series);
  const unit = history.unit;
  const trend: Datum<TrendStats> = model
    ? derived(trendStats(model), "percent", { method: model.kind === "seasonal" ? MODEL_METHOD.seasonal : MODEL_METHOD.trendOnly, inputs: [history] })
    : none("Ajustement de tendance impossible.");

  const stats = model ? seasonalityStats(model) : null;
  const seasonality: Datum<SeasonalityStats> = stats
    ? derived(stats, "ratio", { method: MODEL_METHOD.seasonal, inputs: [history] })
    : none(`Saisonnalité : au moins ${FORECAST_PARAMS.minMonthsForSeasonality} mois d'historique requis.`);

  const forecast: Datum<DemandForecast> =
    model?.kind === "seasonal"
      ? estimate(
          { basis: history.value.basis, method: MODEL_METHOD.seasonal, points: forecastPoints(model, FORECAST_PARAMS.horizonMonths) },
          unit,
          { method: MODEL_METHOD.seasonal, inputs: [history], note: "Intervalle P10–P90 issu de l'erreur de prédiction du modèle." },
        )
      : none(`Prévision : au moins ${FORECAST_PARAMS.minMonthsForSeasonality} mois d'historique requis.`);

  return {
    analysis: {
      history,
      avgMonthlySearches,
      trend,
      seasonality,
      forecast,
      futureGrowthPct: futureGrowth(history, forecast),
      monthsToNextPeak: nextPeak(seasonality, now),
    },
    crossSourceCorrelation,
  };
}

function futureGrowth(history: Known<DemandHistory>, forecast: Datum<DemandForecast>): Datum<number> {
  if (!isKnown(forecast)) return insufficient("Pas de prévision disponible.", forecast.missing);
  const last12 = sum(history.value.series.slice(-12).map((p) => p.value));
  const next12 = sum(forecast.value.points.map((p) => p.p50));
  if (last12 <= 0) return insufficient("Demande observée nulle sur 12 mois.", []);
  return estimate(round((next12 / last12 - 1) * 100, 1), "percent", {
    method: "forecast_p50_next12_vs_observed_last12",
    inputs: [history, forecast],
  });
}

function nextPeak(seasonality: Datum<SeasonalityStats>, now: Date): Datum<number> {
  if (!isKnown(seasonality)) return insufficient("Saisonnalité indisponible.", seasonality.missing);
  const current = monthOfYear(toYearMonth(now));
  const [peak] = seasonality.value.peakMonths.toSorted((a, b) => ((a - current + 12) % 12) - ((b - current + 12) % 12));
  return derived((peak - current + 12) % 12, "months", { method: "months_until_next_seasonal_peak", inputs: [seasonality] });
}
