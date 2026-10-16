import type { Distribution } from "@/domain/assumption";
import type { Interval } from "@/domain/datum";
import { normal, triangular, type Rng } from "@/lib/random";
import { Z80, Z90 } from "./descriptive";

/** Samplers used by the Monte Carlo estimates. */

export function sampleDistribution(d: Distribution, rng: Rng): number {
  return d.type === "fixed" ? d.value : triangular(rng, d.min, d.mode, d.max);
}

export interface LogNormal {
  readonly mu: number;
  readonly sigma: number;
}

/** Log-normal whose P10/P90 match the interval (P50 is not forced). */
export function logNormalFromP10P90(interval: Pick<Interval, "p10" | "p90">): LogNormal | null {
  if (interval.p10 <= 0 || interval.p90 <= 0 || interval.p90 < interval.p10) return null;
  const lo = Math.log(interval.p10);
  const hi = Math.log(interval.p90);
  return { mu: (lo + hi) / 2, sigma: (hi - lo) / (2 * Z90) };
}

/**
 * Log-normal from a P20–P80 range. Google documents Keyword Planner's
 * top-of-page bid "low range" as the 20th percentile and "high range" as the 80th.
 */
export function logNormalFromP20P80(low: number, high: number): LogNormal | null {
  if (low <= 0 || high <= 0 || high < low) return null;
  const lo = Math.log(low);
  const hi = Math.log(high);
  return { mu: (lo + hi) / 2, sigma: (hi - lo) / (2 * Z80) };
}

export const sampleLogNormal = (d: LogNormal, rng: Rng, z: number = normal(rng)): number => Math.exp(d.mu + d.sigma * z);
