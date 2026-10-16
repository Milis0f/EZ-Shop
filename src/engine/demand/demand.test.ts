import { describe, expect, it } from "vitest";
import { DATA_INSUFFICIENT, insufficient, isKnown, observed } from "@/domain/datum";
import { createRng } from "@/lib/random";
import { kpDatum, syntheticSeries, TEST_NOW, testSource, trendsDatum } from "@/test/fixtures";
import { analyzeDemand } from "./analyze";
import { buildDemandHistory, sumByMonth } from "./history";

const noKp = insufficient("Keyword Planner non connecté", ["google-ads-keyword-planner"]);
const noTrends = insufficient("Trends non connecté", ["google-trends"]);

describe("buildDemandHistory", () => {
  it("returns DATA_INSUFFICIENT when no source has data", () => {
    const built = buildDemandHistory({ keywordMetrics: noKp, searchInterest: noTrends });
    expect(built.history.status).toBe(DATA_INSUFFICIENT);
    expect(built.avgMonthlySearches.status).toBe(DATA_INSUFFICIENT);
    expect(isKnown(built.history) ? [] : built.history.missing).toEqual(["google-ads-keyword-planner", "google-trends", "wikimedia"]);
  });

  it("falls back to Wikipedia pageviews as a category-interest shape, never as searches", () => {
    const series = syntheticSeries({ months: 36, base: 2_000, annualGrowth: 0.05, amplitude: 0.4, peakMonth: 12 });
    const topicInterest = observed(
      { language: "fr" as const, article: "Chaussette", wikidataId: "Q43663", points: series, source: testSource("wikimedia") },
      "pageviews_per_month",
      [testSource("wikimedia")],
    );
    const built = buildDemandHistory({ keywordMetrics: noKp, searchInterest: noTrends, topicInterest });
    expect(isKnown(built.history) && built.history.value.basis).toBe("topic_interest");
    expect(isKnown(built.history) && built.history.unit).toBe("pageviews_per_month");
    expect(built.avgMonthlySearches.status).toBe(DATA_INSUFFICIENT);
  });

  it("keeps a Trends-only history as a relative index, never as a volume", () => {
    const series = syntheticSeries({ months: 36, base: 1_000, annualGrowth: 0.1, amplitude: 0.3, peakMonth: 12 });
    const built = buildDemandHistory({ keywordMetrics: noKp, searchInterest: trendsDatum(series) });
    expect(isKnown(built.history) && built.history.value.basis).toBe("relative_index");
    expect(built.avgMonthlySearches.status).toBe(DATA_INSUFFICIENT);
  });

  it("calibrates a long Trends series on Keyword Planner volumes and measures consistency", () => {
    const long = syntheticSeries({ months: 60, base: 5_000, annualGrowth: 0.15, amplitude: 0.4, peakMonth: 11 });
    const built = buildDemandHistory({ keywordMetrics: kpDatum(long.slice(-12)), searchInterest: trendsDatum(long) });
    expect(isKnown(built.history)).toBe(true);
    if (!isKnown(built.history)) return;
    expect(built.history.value.basis).toBe("absolute_volume");
    expect(built.history.kind).toBe("derived");
    expect(built.history.value.series).toHaveLength(60);
    expect(built.crossSourceCorrelation).toBeGreaterThan(0.99);
  });

  it("sums term series month by month", () => {
    expect(sumByMonth([[{ month: "2026-01", value: 1 }], [{ month: "2026-01", value: 2 }, { month: "2026-02", value: 5 }]])).toEqual([
      { month: "2026-01", value: 3 },
      { month: "2026-02", value: 5 },
    ]);
  });
});

describe("analyzeDemand", () => {
  const rng = createRng("demand-jitter");
  const series = syntheticSeries({
    months: 48,
    base: 10_000,
    annualGrowth: 0.2,
    amplitude: 0.5,
    peakMonth: 12,
    jitter: () => (rng() - 0.5) * 0.04,
  });
  const { analysis } = analyzeDemand({ keywordMetrics: kpDatum(series), searchInterest: noTrends }, TEST_NOW);

  it("recovers the trend of a known series", () => {
    expect(isKnown(analysis.trend)).toBe(true);
    if (!isKnown(analysis.trend)) return;
    expect(analysis.trend.value.annualGrowthPct).toBeGreaterThan(15);
    expect(analysis.trend.value.annualGrowthPct).toBeLessThan(25);
    expect(analysis.trend.value.direction).toBe("rising");
    expect(analysis.trend.kind).toBe("derived");
  });

  it("finds the seasonal peak and flags strong seasonality", () => {
    expect(isKnown(analysis.seasonality)).toBe(true);
    if (!isKnown(analysis.seasonality)) return;
    expect(analysis.seasonality.value.peakMonths).toContain(12);
    expect(analysis.seasonality.value.isSeasonal).toBe(true);
    expect(analysis.seasonality.value.monthlyIndex).toHaveLength(12);
    // October 2026 → next December peak in 2 months.
    expect(isKnown(analysis.monthsToNextPeak) && analysis.monthsToNextPeak.value).toBe(2);
  });

  it("forecasts 12 ordered P10 ≤ P50 ≤ P90 months as an estimate", () => {
    expect(isKnown(analysis.forecast)).toBe(true);
    if (!isKnown(analysis.forecast)) return;
    expect(analysis.forecast.kind).toBe("estimate");
    expect(analysis.forecast.value.points).toHaveLength(12);
    expect(analysis.forecast.value.points[0].month).toBe("2026-10");
    for (const p of analysis.forecast.value.points) {
      expect(p.p10).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p90);
    }
    expect(isKnown(analysis.futureGrowthPct) && analysis.futureGrowthPct.value).toBeGreaterThan(10);
  });

  it("gives a trend but no seasonality nor forecast with 12–23 months", () => {
    const short = syntheticSeries({ months: 18, base: 2_000, annualGrowth: 0, amplitude: 0.2, peakMonth: 6 });
    const result = analyzeDemand({ keywordMetrics: kpDatum(short), searchInterest: noTrends }, TEST_NOW).analysis;
    expect(isKnown(result.trend)).toBe(true);
    expect(result.seasonality.status).toBe(DATA_INSUFFICIENT);
    expect(result.forecast.status).toBe(DATA_INSUFFICIENT);
    expect(result.futureGrowthPct.status).toBe(DATA_INSUFFICIENT);
  });
});
