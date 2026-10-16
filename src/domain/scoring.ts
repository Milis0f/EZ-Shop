import type { Datum } from "./datum";

export type CriterionStatus = "scored" | "DATA_INSUFFICIENT";

export interface CriterionResult {
  readonly id: string;
  readonly label: string;
  /** Points this criterion can contribute out of 100. */
  readonly weight: number;
  readonly status: CriterionStatus;
  /** 0–1 after normalization; undefined when insufficient. */
  readonly normalized?: number;
  /** Points actually contributed (normalized × weight, before renormalization). */
  readonly points?: number;
  readonly rawValue?: number;
  readonly rawLabel?: string;
  readonly explanation: string;
  readonly missing: readonly string[];
}

export interface ScoreCap {
  readonly cap: number;
  readonly reason: string;
}

export interface OpportunityScore {
  /** 0–100, renormalized over the criteria that could be scored. */
  readonly total: number;
  /** Share of total weight backed by data, 0–1. */
  readonly coverage: number;
  readonly cap?: ScoreCap;
  readonly criteria: readonly CriterionResult[];
  readonly modelVersion: string;
}

export interface ConfidenceFactor {
  readonly id: "coverage" | "freshness" | "source_quality" | "consistency";
  readonly label: string;
  readonly value: number;
  readonly explanation: string;
}

export type ConfidenceLevel = "high" | "medium" | "low" | "very_low";

/** Computed independently from the opportunity score — never merged with it. */
export interface ConfidenceAssessment {
  readonly score: number;
  readonly level: ConfidenceLevel;
  readonly factors: readonly ConfidenceFactor[];
  readonly mockTainted: boolean;
}

export type Decision = "prioritize" | "test_carefully" | "avoid" | "exploratory_only" | "insufficient_data";

export interface ScoredCountry {
  readonly score: Datum<OpportunityScore>;
  /** Criteria breakdown, always available (even when the total is insufficient). */
  readonly criteria: readonly CriterionResult[];
  readonly confidence: ConfidenceAssessment;
  readonly decision: Decision;
}
