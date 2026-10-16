/**
 * TEST FIXTURES — synthetic inputs with KNOWN properties, used to check the engine.
 * Not market data, not used by the app.
 */

import { observed, type Datum } from "@/domain/datum";
import type { MonthlyPoint } from "@/domain/market";
import type { SourceRef } from "@/domain/provenance";
import { addMonths, monthOfYear, type YearMonth } from "@/domain/time";
import type { KeywordMetrics, TermInterestSeries } from "@/providers/contracts";

export const TEST_NOW = new Date("2026-10-14T12:00:00Z");
export const LAST_MONTH: YearMonth = "2026-09";

export const testSource = (sourceId: SourceRef["sourceId"], end: string = LAST_MONTH): SourceRef => ({
  sourceId,
  origin: "live",
  collectedAt: TEST_NOW.toISOString(),
  connectorVersion: "test",
  period: { start: "2022-10", end },
});

/** y = base · (1 + growth)^(years) · (1 + amplitude·cos(2π(m − peak)/12)), noiseless unless jitter. */
export function syntheticSeries(opts: {
  months: number;
  base: number;
  annualGrowth: number;
  amplitude: number;
  peakMonth: number;
  end?: YearMonth;
  jitter?: (i: number) => number;
}): MonthlyPoint[] {
  const end = opts.end ?? LAST_MONTH;
  return Array.from({ length: opts.months }, (_, i) => {
    const month = addMonths(end, i - (opts.months - 1));
    const years = (i - (opts.months - 1)) / 12;
    const season = 1 + opts.amplitude * Math.cos((2 * Math.PI * (monthOfYear(month) - opts.peakMonth)) / 12);
    const value = opts.base * Math.pow(1 + opts.annualGrowth, years) * season * (1 + (opts.jitter?.(i) ?? 0));
    return { month, value };
  });
}

export function kpDatum(series: MonthlyPoint[], extra: Partial<KeywordMetrics> = {}): Datum<readonly KeywordMetrics[]> {
  const source = testSource("google-ads-keyword-planner");
  const last12 = series.slice(-12);
  const metrics: KeywordMetrics = {
    term: "chaussettes",
    avgMonthlySearches: Math.round(last12.reduce((s, p) => s + p.value, 0) / last12.length),
    monthlyVolumes: series,
    competitionIndex: 40,
    lowTopOfPageBid: 0.3,
    highTopOfPageBid: 0.9,
    currency: "EUR",
    source,
    ...extra,
  };
  return observed([metrics], "searches_per_month", [source]);
}

export function trendsDatum(series: MonthlyPoint[]): Datum<readonly TermInterestSeries[]> {
  const source = testSource("google-trends");
  const max = Math.max(...series.map((p) => p.value));
  const points = series.map((p) => ({ month: p.month, value: Math.round((p.value / max) * 100) }));
  return observed([{ term: "chaussettes", points, source }], "index_0_100", [source]);
}
