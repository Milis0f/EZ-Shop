import type { CountryAnalysis } from "@/domain/analysis";
import { isKnown } from "@/domain/datum";
import { verdictFor, type VerdictValue } from "./verdict";

/**
 * Simple-mode helpers, computed only from the analysis (nothing estimated here). The verdict itself is
 * `verdict_v1` (./verdict); missing data is said, never filled in.
 */

export interface InterestFigure {
  readonly value: number;
  /** What the number counts, for the label under it. */
  readonly label: string;
  readonly direct: boolean;
}

/** Searches per month when Keyword Planner answered, else monthly Wikipedia readers of the category (labelled as such). */
export function interestPerMonth(c: CountryAnalysis): InterestFigure | null {
  if (isKnown(c.demand.avgMonthlySearches)) return { value: c.demand.avgMonthlySearches.value, label: "recherches Google par mois", direct: true };
  const history = c.demand.history;
  if (isKnown(history) && history.value.basis === "topic_interest") {
    const last = history.value.series.slice(-12);
    if (last.length === 0) return null;
    const article = c.signals && isKnown(c.signals.topicInterest) ? c.signals.topicInterest.value.article : "la catégorie";
    return { value: Math.round(last.reduce((s, p) => s + p.value, 0) / last.length), label: `lecteurs par mois de l'article Wikipédia « ${article} »`, direct: false };
  }
  return null;
}

const VERDICT_RANK: Readonly<Record<VerdictValue, number>> = { oui: 0, surveiller: 1, non: 2 };

/** Countries from most to least promising: verdict, then score, then interest trend. */
export function rankForSimple(countries: readonly CountryAnalysis[]): CountryAnalysis[] {
  const score = (c: CountryAnalysis) => (isKnown(c.scoring.score) ? c.scoring.score.value.total : -1);
  const growth = (c: CountryAnalysis) => (isKnown(c.demand.trend) ? c.demand.trend.value.annualGrowthPct : -Infinity);
  return countries.toSorted(
    (a, b) => VERDICT_RANK[verdictFor(a).value] - VERDICT_RANK[verdictFor(b).value] || score(b) - score(a) || growth(b) - growth(a),
  );
}
