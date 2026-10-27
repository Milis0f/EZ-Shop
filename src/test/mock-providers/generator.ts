/**
 * ⚠ DEVELOPMENT FIXTURES — SYNTHETIC VALUES FOR VISUAL DEVELOPMENT ONLY.
 * Nothing here is market data. Values are deterministic functions of (term, country)
 * so screens are stable between reloads. Tests only: product code never imports src/test/.
 */

import type { CountryCode } from "@/domain/country";
import type { MonthlyPoint } from "@/domain/market";
import { monthOfYear, monthRange, addMonths, type YearMonth } from "@/domain/time";
import { createRng, logUniform, normal, uniform } from "@/lib/random";

export interface LatentProfile {
  readonly base: number;
  readonly annualGrowth: number;
  readonly amplitude: number;
  readonly peakMonth: number;
  readonly noise: number;
}

export function latentProfile(term: string, country: CountryCode): LatentProfile {
  const rng = createRng(`latent|${term.toLowerCase()}|${country}`);
  return {
    base: logUniform(rng, 400, 60_000),
    annualGrowth: uniform(rng, -0.18, 0.45),
    amplitude: uniform(rng, 0.05, 0.6),
    peakMonth: 1 + Math.floor(rng() * 12),
    noise: uniform(rng, 0.04, 0.12),
  };
}

/** Synthetic monthly searches over [to − months + 1, to]. */
export function latentSeries(term: string, country: CountryCode, to: YearMonth, months: number): MonthlyPoint[] {
  const p = latentProfile(term, country);
  const rng = createRng(`noise|${term.toLowerCase()}|${country}|${to}`);
  const from = addMonths(to, -(months - 1));
  return monthRange(from, to).map((month, i) => {
    const yearsFromEnd = (i - (months - 1)) / 12;
    const trend = Math.pow(1 + p.annualGrowth, yearsFromEnd);
    const season = 1 + p.amplitude * Math.cos((2 * Math.PI * (monthOfYear(month) - p.peakMonth)) / 12);
    const value = p.base * trend * season * Math.exp(p.noise * normal(rng));
    return { month, value };
  });
}

/** Keyword Planner rounds volumes; two significant digits mimics that. */
export const roundVolume = (v: number): number => {
  if (v < 10) return Math.round(v);
  const magnitude = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / magnitude) * magnitude;
};

export interface MockAdProfile {
  readonly activeAds: number;
  readonly advertiserRatio: number;
  readonly weeklyGrowth: number;
}

export function adProfile(platform: "meta" | "tiktok", term: string, country: CountryCode): MockAdProfile {
  const rng = createRng(`ads|${platform}|${term.toLowerCase()}|${country}`);
  return {
    activeAds: Math.round(logUniform(rng, platform === "meta" ? 8 : 3, platform === "meta" ? 1_800 : 600)),
    advertiserRatio: uniform(rng, 0.15, 0.55),
    weeklyGrowth: uniform(rng, -0.03, 0.06),
  };
}

export function mockSeedRng(...parts: readonly string[]) {
  return createRng(parts.join("|"));
}
