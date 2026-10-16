import type { Unit } from "./datum";

/**
 * Assumptions are hypotheses, not data. Each one is displayed with its
 * origin (default configuration or user override) and its rationale.
 */

export type Distribution =
  | { readonly type: "fixed"; readonly value: number }
  | { readonly type: "triangular"; readonly min: number; readonly mode: number; readonly max: number };

export const ASSUMPTION_KEYS = [
  "traffic_capture_share",
  "conversion_rate",
  "social_ctr",
  "test_target_conversions",
] as const;

export type AssumptionKey = (typeof ASSUMPTION_KEYS)[number];

export interface Assumption {
  readonly key: AssumptionKey;
  readonly label: string;
  readonly description: string;
  readonly unit: Unit;
  readonly distribution: Distribution;
  readonly origin: "default" | "user";
  readonly rationale: string;
}

export type AssumptionSet = Readonly<Record<AssumptionKey, Assumption>>;

export function distributionMean(d: Distribution): number {
  return d.type === "fixed" ? d.value : (d.min + d.mode + d.max) / 3;
}
