import { describe, expect, it } from "vitest";
import { createRng, triangular } from "@/lib/random";
import { pearson, quantileSorted, simulate, toInterval } from "./descriptive";
import { linearScale, log10Scale, towards } from "./normalize";
import { invert, linearFit, ols, predictionStdError } from "./ols";
import { logNormalFromP10P90, logNormalFromP20P80, sampleLogNormal } from "./sampling";

describe("ols", () => {
  it("recovers exact coefficients of a noiseless linear model", () => {
    const xs = Array.from({ length: 20 }, (_, i) => i);
    const fit = linearFit(xs, xs.map((x) => 3 + 0.5 * x));
    expect(fit).not.toBeNull();
    expect(fit!.beta[0]).toBeCloseTo(3, 8);
    expect(fit!.beta[1]).toBeCloseTo(0.5, 8);
    expect(fit!.r2).toBeCloseTo(1, 8);
  });

  it("returns null when the design matrix is singular or underdetermined", () => {
    expect(ols([[1, 1], [1, 1], [1, 1]], [1, 2, 3])).toBeNull();
    expect(ols([[1, 2]], [1])).toBeNull();
  });

  it("widens prediction error with extrapolation distance", () => {
    const rng = createRng("ols-noise");
    const xs = Array.from({ length: 30 }, (_, i) => i);
    const fit = linearFit(xs, xs.map((x) => 1 + 0.2 * x + (rng() - 0.5)))!;
    expect(predictionStdError(fit, [1, 60])).toBeGreaterThan(predictionStdError(fit, [1, 15]));
  });

  it("inverts a matrix", () => {
    const inv = invert([[4, 7], [2, 6]])!;
    expect(inv[0][0]).toBeCloseTo(0.6);
    expect(inv[0][1]).toBeCloseTo(-0.7);
    expect(inv[1][0]).toBeCloseTo(-0.2);
    expect(inv[1][1]).toBeCloseTo(0.4);
  });
});

describe("descriptive", () => {
  it("interpolates quantiles", () => {
    expect(quantileSorted([0, 10], 0.5)).toBe(5);
    expect(toInterval([5, 1, 3, 2, 4])).toEqual({ p10: 1.4, p50: 3, p90: 4.6 });
  });

  it("computes pearson correlation and rejects degenerate input", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pearson([1, 2], [1, 2])).toBeNull();
  });

  it("is deterministic for a given seed", () => {
    const draw = (seed: string) => simulate(500, createRng(seed), (r) => r());
    expect(draw("a")).toEqual(draw("a"));
    expect(draw("a")).not.toEqual(draw("b"));
  });
});

describe("sampling", () => {
  it("keeps triangular draws within bounds", () => {
    const rng = createRng("tri");
    for (let i = 0; i < 2_000; i += 1) {
      const v = triangular(rng, 1, 2, 5);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it("round-trips a P10/P90 log-normal through simulation", () => {
    const d = logNormalFromP10P90({ p10: 100, p90: 400 })!;
    const interval = simulate(20_000, createRng("ln"), (r) => sampleLogNormal(d, r));
    expect(interval.p10).toBeGreaterThan(90);
    expect(interval.p10).toBeLessThan(110);
    expect(interval.p90).toBeGreaterThan(360);
    expect(interval.p90).toBeLessThan(440);
  });

  it("rejects invalid ranges", () => {
    expect(logNormalFromP10P90({ p10: 0, p90: 5 })).toBeNull();
    expect(logNormalFromP20P80(2, 1)).toBeNull();
  });
});

describe("normalize", () => {
  it("clamps and orients scales", () => {
    expect(linearScale(150, 0, 100)).toBe(1);
    expect(linearScale(-5, 0, 100)).toBe(0);
    expect(towards(0.3, 0.3, 1.2)).toBe(1);
    expect(towards(1.2, 0.3, 1.2)).toBe(0);
    expect(log10Scale(1_000, 2, 5)).toBeCloseTo(1 / 3);
    expect(log10Scale(0, 2, 5)).toBe(0);
  });
});
