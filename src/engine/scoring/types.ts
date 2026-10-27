import type { CriterionId } from "@/config/scoring";
import type { UnitEconomics } from "@/domain/analysis";
import type { Datum } from "@/domain/datum";
import type { ChannelCost, CompetitionAnalysis, DemandAnalysis, MarketContext } from "@/domain/market";
import type { ContentActivity, SearchSuggestions } from "@/domain/signals";
import type { SourceRef } from "@/domain/provenance";
import type { CriterionResult, ScoreCap } from "@/domain/scoring";

/** Everything a criterion may read. Criteria are pure functions of this context. */
export interface ScoringContext {
  readonly demand: DemandAnalysis;
  readonly competition: CompetitionAnalysis;
  readonly advertising: readonly ChannelCost[];
  readonly market: MarketContext;
  readonly economics: UnitEconomics;
  /** Data sources v2. Optional so the v1 criteria keep working on their own. */
  readonly signals?: {
    readonly searchSuggestions: Datum<SearchSuggestions>;
    readonly content: Datum<ContentActivity>;
    /** Landed unit cost in the country (supplier price + shipping + duty), EUR. */
    readonly landedUnitCostEur: Datum<number>;
  };
}

export type CriterionEvaluation =
  | {
      readonly status: "scored";
      /** 0–1, higher = more attractive. */
      readonly normalized: number;
      readonly rawValue?: number;
      readonly rawLabel?: string;
      readonly explanation: string;
      readonly sources: readonly SourceRef[];
      readonly cap?: ScoreCap;
    }
  | {
      readonly status: "DATA_INSUFFICIENT";
      readonly explanation: string;
      readonly missing: readonly string[];
    };

/**
 * Extension point: implement this interface and register the criterion
 * (with a weight in config/scoring.ts) to add a dimension to the score.
 */
export interface Criterion {
  readonly id: CriterionId;
  readonly label: string;
  /** Fast-moving signal (demand, competition, ads) — used by the freshness factor. */
  readonly timeSensitive: boolean;
  evaluate(ctx: ScoringContext): CriterionEvaluation;
}

export interface EvaluatedCriterion {
  readonly criterion: Criterion;
  readonly evaluation: CriterionEvaluation;
  readonly result: CriterionResult;
}
