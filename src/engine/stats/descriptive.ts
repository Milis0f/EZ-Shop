import type { Interval } from "@/domain/datum";
import type { Rng } from "@/lib/random";

/** z-score of the 90th percentile of the standard normal. */
export const Z90 = 1.2815515655446004;
/** z-score of the 80th percentile of the standard normal. */
export const Z80 = 0.8416212335729143;

export const mean = (values: readonly number[]): number =>
  values.length === 0 ? Number.NaN : values.reduce((s, v) => s + v, 0) / values.length;

export const sum = (values: readonly number[]): number => values.reduce((s, v) => s + v, 0);

/** Linear-interpolated quantile of an ascending-sorted array. */
export function quantileSorted(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Quantile of unsorted values (copies and sorts). */
export const quantile = (values: readonly number[], q: number): number => quantileSorted(values.toSorted((a, b) => a - b), q);

export function toInterval(samples: readonly number[]): Interval {
  const sorted = samples.toSorted((a, b) => a - b);
  return { p10: quantileSorted(sorted, 0.1), p50: quantileSorted(sorted, 0.5), p90: quantileSorted(sorted, 0.9) };
}

/** Run `draw` n times and summarize as P10/P50/P90. */
export function simulate(n: number, rng: Rng, draw: (rng: Rng) => number): Interval {
  return toInterval(Array.from({ length: n }, () => draw(rng)));
}

export function pearson(a: readonly number[], b: readonly number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null;
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < a.length; i += 1) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : null;
}

export const variance = (values: readonly number[]): number => {
  const m = mean(values);
  return values.length < 2 ? 0 : values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
};
