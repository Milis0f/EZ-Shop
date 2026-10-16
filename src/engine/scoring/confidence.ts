import { CONFIDENCE_PARAMS, DECISION_THRESHOLDS } from "@/config/scoring";
import { isKnown, type Datum } from "@/domain/datum";
import type { SourceRef } from "@/domain/provenance";
import type { ConfidenceAssessment, ConfidenceFactor, ConfidenceLevel, Decision, OpportunityScore } from "@/domain/scoring";
import { clamp01, round } from "../stats/normalize";
import type { EvaluatedCriterion } from "./types";

/**
 * confidence = coverage × freshness × source quality × cross-source consistency
 * Kept strictly separate from the opportunity score.
 */

export interface ConfidenceInputs {
  readonly evaluated: readonly EvaluatedCriterion[];
  /** Pearson r between independent demand sources, when both exist. */
  readonly crossSourceCorrelation: number | null;
  /** Number of independent demand sources with data (Keyword Planner, Trends). */
  readonly demandSourceCount: number;
  /** Indirect demand signals with data (Autocomplete, Wikipedia, YouTube), used when no direct source exists. */
  readonly indirectDemandSignals?: number;
  readonly qualityOf: (sourceId: string) => number | undefined;
  readonly now: Date;
}

const DAY_MS = 86_400_000;

/** End of a `YYYY`, `YYYY-MM` or `YYYY-MM-DD` period, as a timestamp. */
export function periodEndMs(end: string): number | null {
  if (/^\d{4}$/.test(end)) return Date.UTC(Number(end), 11, 31);
  if (/^\d{4}-\d{2}$/.test(end)) return Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)), 0);
  const t = Date.parse(end);
  return Number.isNaN(t) ? null : t;
}

export function freshnessFromAge(ageDays: number): number {
  const { freshFullDays: full, freshHalfDays: half, staleFloor } = CONFIDENCE_PARAMS;
  if (ageDays <= full) return 1;
  if (ageDays <= half) return 1 - (0.5 * (ageDays - full)) / (half - full);
  return Math.max(staleFloor, (0.5 * half) / ageDays);
}

const scoredSources = (e: EvaluatedCriterion): readonly SourceRef[] =>
  e.evaluation.status === "scored" ? e.evaluation.sources : [];

const levelOf = (score: number): ConfidenceLevel =>
  score >= 80 ? "high" : score >= 60 ? "medium" : score >= 40 ? "low" : "very_low";

export function assessConfidence(input: ConfidenceInputs): ConfidenceAssessment {
  const { evaluated, now } = input;
  const total = evaluated.reduce((s, e) => s + e.result.weight, 0);
  const scored = evaluated.filter((e) => e.evaluation.status === "scored");
  const coverage = total > 0 ? scored.reduce((s, e) => s + e.result.weight, 0) / total : 0;

  const fastEnds = scored
    .filter((e) => e.criterion.timeSensitive)
    .flatMap(scoredSources)
    .flatMap((s) => (s.period ? [periodEndMs(s.period.end)] : []))
    .filter((t): t is number => t !== null);
  const latest = fastEnds.length > 0 ? Math.max(...fastEnds) : null;
  const ageDays = latest === null ? null : Math.max(0, (now.getTime() - latest) / DAY_MS);
  const freshness = ageDays === null ? 0 : freshnessFromAge(ageDays);

  let weightedQuality = 0;
  let qualityWeight = 0;
  for (const e of scored) {
    const tiers = scoredSources(e).map((s) => input.qualityOf(s.sourceId)).filter((q): q is number => q !== undefined);
    if (tiers.length === 0) continue;
    weightedQuality += e.result.weight * (tiers.reduce((a, b) => a + b, 0) / tiers.length);
    qualityWeight += e.result.weight;
  }
  const quality = qualityWeight > 0 ? weightedQuality / qualityWeight : 0;

  const r = input.crossSourceCorrelation;
  const indirectOnly = input.demandSourceCount === 0 && (input.indirectDemandSignals ?? 0) > 0;
  const consistency =
    r !== null
      ? clamp01((r + 1) / 2)
      : input.demandSourceCount === 1
        ? CONFIDENCE_PARAMS.singleSourceConsistency
        : indirectOnly
          ? CONFIDENCE_PARAMS.indirectOnlyConsistency
          : 0;

  const factors: ConfidenceFactor[] = [
    { id: "coverage", label: "Couverture", value: round(coverage, 3), explanation: "Part du poids du score appuyée par des données." },
    {
      id: "freshness",
      label: "Fraîcheur",
      value: round(freshness, 3),
      explanation: ageDays === null ? "Aucune donnée récente de demande ou de concurrence." : `Donnée rapide la plus récente : ${Math.round(ageDays)} jours.`,
    },
    { id: "source_quality", label: "Qualité des sources", value: round(quality, 3), explanation: "Fiabilité moyenne des sources utilisées (pondérée)." },
    {
      id: "consistency",
      label: "Cohérence inter-sources",
      value: round(consistency, 3),
      explanation:
        r !== null
          ? `Corrélation Keyword Planner / Trends r = ${round(r, 2)} → (r + 1) / 2.`
          : input.demandSourceCount === 1
            ? "Une seule source de demande : aucun recoupement possible."
            : indirectOnly
              ? "Signaux indirects seulement (recherches associées, Wikipédia, vidéos) : aucun volume à recouper."
              : "Aucune source de demande.",
    },
  ];

  const score = round(100 * coverage * freshness * quality * consistency, 0);
  return {
    score,
    level: levelOf(score),
    factors,
    mockTainted: scored.some((e) => scoredSources(e).some((s) => s.origin === "mock")),
  };
}

export function decide(score: Datum<OpportunityScore>, confidence: ConfidenceAssessment): Decision {
  if (!isKnown(score)) return "insufficient_data";
  if (confidence.score < DECISION_THRESHOLDS.minConfidence) return "exploratory_only";
  const total = score.value.total;
  if (total >= DECISION_THRESHOLDS.prioritizeScore && confidence.score >= DECISION_THRESHOLDS.prioritizeConfidence) return "prioritize";
  return total >= DECISION_THRESHOLDS.testScore ? "test_carefully" : "avoid";
}
