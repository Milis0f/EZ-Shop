import type { CountryAnalysis } from "@/domain/analysis";
import { isKnown } from "@/domain/datum";
import type { Decision } from "@/domain/scoring";
import { MONTH_LABELS_FR } from "@/domain/time";

/**
 * Plain-language summary for the simple mode, computed only from the analysis (nothing estimated here).
 * Every sentence says where its number comes from; missing data is said, never filled in.
 */

export type VerdictLevel = "good" | "test" | "weak" | "uncertain" | "unknown";

export interface SimpleVerdict {
  readonly level: VerdictLevel;
  readonly title: string;
  readonly reasons: readonly string[];
}

const DECISION_VERDICT: Record<Decision, { level: VerdictLevel; title: string }> = {
  prioritize: { level: "good", title: "Bon potentiel" },
  test_carefully: { level: "test", title: "À tester" },
  avoid: { level: "weak", title: "Peu porteur" },
  exploratory_only: { level: "uncertain", title: "À confirmer" },
  insufficient_data: { level: "unknown", title: "Pas encore de score" },
};

const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)} %`;
const months = (list: readonly number[]) => list.map((m) => MONTH_LABELS_FR[m - 1]).join(", ");

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

export function verdictFor(c: CountryAnalysis): SimpleVerdict {
  const base = DECISION_VERDICT[c.scoring.decision];
  const reasons: string[] = [];
  const { trend, seasonality } = c.demand;
  const fromWiki = isKnown(c.demand.history) && c.demand.history.value.basis === "topic_interest";

  if (isKnown(trend)) {
    const t = trend.value;
    const word = t.direction === "rising" ? "en hausse" : t.direction === "declining" ? "en baisse" : "stable";
    reasons.push(`Intérêt ${word} (${pct(t.annualGrowthPct)} par an${fromWiki ? ", d'après Wikipédia" : ""}).`);
  }
  if (isKnown(seasonality)) {
    reasons.push(seasonality.value.isSeasonal ? `Pic en ${months(seasonality.value.peakMonths)}.` : "Demande régulière toute l'année.");
  }
  const s = c.signals;
  if (s && isKnown(s.searchSuggestions)) {
    const g = s.searchSuggestions.value;
    if (g.suggestions.length === 0) reasons.push("Aucune recherche associée : peu de gens tapent ce nom.");
    else if (g.intent.length > 0) reasons.push(`${g.intent.length} recherche${g.intent.length > 1 ? "s" : ""} d'achat (prix, avis…) parmi ${g.suggestions.length}.`);
    else if (g.marketplaces.length > 0) reasons.push(`Déjà cherché sur ${g.marketplaces.length > 1 ? "des marketplaces" : "une marketplace"} (${g.marketplaces[0]}).`);
  }
  if (s?.marginAtPlannedPrice && isKnown(s.marginAtPlannedPrice)) reasons.push(`Marge à ton prix : ${Math.round(s.marginAtPlannedPrice.value)} %.`);
  if (base.level === "unknown") reasons.push("Score calculé quand eBay ou Google Ads est branché (mode avancé).");
  return { ...base, reasons: reasons.slice(0, 4) };
}

const LEVEL_RANK: Record<VerdictLevel, number> = { good: 0, test: 1, uncertain: 2, weak: 3, unknown: 4 };

/** Countries from most to least promising: verdict, then score, then interest trend. */
export function rankForSimple(countries: readonly CountryAnalysis[]): CountryAnalysis[] {
  const score = (c: CountryAnalysis) => (isKnown(c.scoring.score) ? c.scoring.score.value.total : -1);
  const growth = (c: CountryAnalysis) => (isKnown(c.demand.trend) ? c.demand.trend.value.annualGrowthPct : -Infinity);
  return countries.toSorted(
    (a, b) => LEVEL_RANK[verdictFor(a).level] - LEVEL_RANK[verdictFor(b).level] || score(b) - score(a) || growth(b) - growth(a),
  );
}
