import { CRITERION_WEIGHTS, SCORING_MODEL_VERSION, SCORING_POLICY } from "@/config/scoring";
import { insufficient, type Datum } from "@/domain/datum";
import { mergeSources } from "@/domain/provenance";
import type { CriterionResult, OpportunityScore, ScoreCap } from "@/domain/scoring";
import { round } from "../stats/normalize";
import { DEFAULT_CRITERIA } from "./criteria";
import type { Criterion, EvaluatedCriterion, ScoringContext } from "./types";

export interface ScoringOptions {
  readonly criteria?: readonly Criterion[];
  readonly weights?: Readonly<Record<string, number>>;
  readonly policy?: typeof SCORING_POLICY;
  readonly modelVersion?: string;
}

export interface ScoringOutput {
  readonly score: Datum<OpportunityScore>;
  readonly evaluated: readonly EvaluatedCriterion[];
}

export function evaluateCriteria(
  ctx: ScoringContext,
  criteria: readonly Criterion[],
  weights: Readonly<Record<string, number>>,
): EvaluatedCriterion[] {
  return criteria.map((criterion) => {
    const evaluation = criterion.evaluate(ctx);
    const weight = weights[criterion.id] ?? 0;
    const result: CriterionResult =
      evaluation.status === "scored"
        ? {
            id: criterion.id,
            label: criterion.label,
            weight,
            status: "scored",
            normalized: evaluation.normalized,
            points: round(evaluation.normalized * weight, 2),
            rawValue: evaluation.rawValue,
            rawLabel: evaluation.rawLabel,
            explanation: evaluation.explanation,
            missing: [],
          }
        : {
            id: criterion.id,
            label: criterion.label,
            weight,
            status: "DATA_INSUFFICIENT",
            explanation: evaluation.explanation,
            missing: evaluation.missing,
          };
    return { criterion, evaluation, result };
  });
}

/**
 * Weighted score renormalized over the criteria backed by data.
 * Refuses to produce a total when coverage is too low or no demand criterion is available.
 */
export function scoreCountry(ctx: ScoringContext, options: ScoringOptions = {}): ScoringOutput {
  const criteria = options.criteria ?? DEFAULT_CRITERIA;
  const weights = options.weights ?? CRITERION_WEIGHTS;
  const policy = options.policy ?? SCORING_POLICY;
  const modelVersion = options.modelVersion ?? SCORING_MODEL_VERSION;

  const evaluated = evaluateCriteria(ctx, criteria, weights);
  const totalWeight = evaluated.reduce((s, e) => s + e.result.weight, 0);
  const scored = evaluated.filter((e) => e.evaluation.status === "scored");
  const scoredWeight = scored.reduce((s, e) => s + e.result.weight, 0);
  const coverage = totalWeight > 0 ? scoredWeight / totalWeight : 0;
  const missingInputs = evaluated.flatMap((e) => e.result.missing);

  const hasDemand = scored.some((e) => (policy.requiredAnyOf as readonly string[]).includes(e.criterion.id));
  if (!hasDemand) {
    return { score: insufficient("Aucun critère de demande disponible : score non calculable.", missingInputs), evaluated };
  }
  if (coverage < policy.minCoverage) {
    return {
      score: insufficient(
        `Couverture des données ${Math.round(coverage * 100)} % < ${Math.round(policy.minCoverage * 100)} % requis.`,
        missingInputs,
      ),
      evaluated,
    };
  }

  const raw = (100 * scored.reduce((s, e) => s + (e.result.points ?? 0), 0)) / scoredWeight;
  const caps = scored.flatMap((e) => (e.evaluation.status === "scored" && e.evaluation.cap ? [e.evaluation.cap] : []));
  const cap: ScoreCap | undefined = caps.toSorted((a, b) => a.cap - b.cap)[0];
  const total = round(cap ? Math.min(raw, cap.cap) : raw, 1);

  return {
    score: {
      status: "known",
      kind: "estimate",
      value: { total, coverage: round(coverage, 3), cap: cap && raw > cap.cap ? cap : undefined, criteria: evaluated.map((e) => e.result), modelVersion },
      unit: "score_0_100",
      sources: mergeSources(...scored.map((e) => (e.evaluation.status === "scored" ? e.evaluation.sources : []))),
      method: `opportunity_score_${modelVersion}`,
    },
    evaluated,
  };
}
