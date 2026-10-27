import type { CountryAnalysis } from "@/domain/analysis";
import { isKnown } from "@/domain/datum";
import type { CriterionResult, Decision } from "@/domain/scoring";
import { MONTH_LABELS_FR } from "@/domain/time";
import { SOURCE_LABELS } from "@/lib/format";

/**
 * Verdict rule `verdict_v1`: a presentation of the existing decision plus blocking factors computed only
 * from real inputs. Score, weights and thresholds are unchanged. A missing margin is never blocking.
 */

export type VerdictValue = "oui" | "non" | "surveiller";
export type VerdictLabel = "OUI" | "NON" | "À SURVEILLER";

export interface BlockingFactor {
  readonly id: "loss_at_planned_price" | "below_target_margin" | "no_demand_data";
  readonly message: string;
}

export interface Verdict {
  readonly value: VerdictValue;
  readonly label: VerdictLabel;
  readonly reason: string;
  readonly blocking: readonly BlockingFactor[];
  readonly supporting: readonly string[];
  readonly method: "verdict_v1";
}

const LABELS: Readonly<Record<VerdictValue, VerdictLabel>> = { oui: "OUI", non: "NON", surveiller: "À SURVEILLER" };

const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)} %`;
const months = (list: readonly number[]) => list.map((m) => MONTH_LABELS_FR[m - 1]).join(", ");
/** Unit prices keep their cents: a minimum price rounded up or down would be a different price. */
const unitPrice = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Ends a sentence once: abbreviated month labels already end with a full stop. */
const sentence = (text: string) => (text.endsWith(".") ? text : `${text}.`);
const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

/** Blocking factors, each only from real inputs and data. */
export function blockingFactors(c: CountryAnalysis): BlockingFactor[] {
  const factors: BlockingFactor[] = [];
  const margin = c.signals?.marginAtPlannedPrice;
  const minimum = c.signals?.minPriceForTargetMargin;
  if (margin && isKnown(margin) && margin.value < 0) {
    factors.push({ id: "loss_at_planned_price", message: `Perte à ton prix : marge de ${Math.round(margin.value)} % ${costBasis(c)}.` });
  }
  if (margin && isKnown(margin) && minimum && isKnown(minimum) && margin.value < minimum.value.targetMarginPct) {
    const { exVatEur, inclVatEur, targetMarginPct } = minimum.value;
    const incl = inclVatEur === null ? "" : `${unitPrice.format(inclVatEur)} TTC, soit `;
    factors.push({
      id: "below_target_margin",
      message: `Prix sous le minimum pour ta marge de ${targetMarginPct} % : vends au moins ${incl}${unitPrice.format(exVatEur)} HT.`,
    });
  }
  if (!hasDemandData(c)) {
    factors.push({ id: "no_demand_data", message: "Aucune donnée de demande nationale pour ce pays : toutes les sources ont échoué." });
  }
  return factors;
}

/** What the landed cost holds, as `landedUnitCost` builds it: duties only when they could be computed. */
function costBasis(c: CountryAnalysis): string {
  const taxes = c.signals?.taxes;
  const dutyIncluded = taxes !== undefined && isKnown(taxes) && taxes.value.dutyPerUnitEur !== null;
  return dutyIncluded ? "après droits et livraison" : "livraison comprise, droits non inclus";
}

function hasDemandData(c: CountryAnalysis): boolean {
  const s = c.signals;
  return (
    isKnown(c.demand.avgMonthlySearches) ||
    isKnown(c.demand.history) ||
    (s !== undefined && (isKnown(s.searchSuggestions) || isKnown(s.content) || isKnown(s.topicInterest)))
  );
}

/** Plain-language signals from the data that exists; nothing estimated here. */
export function supportingSignals(c: CountryAnalysis): string[] {
  const reasons: string[] = [];
  const { trend, seasonality } = c.demand;
  const fromWiki = isKnown(c.demand.history) && c.demand.history.value.basis === "topic_interest";
  if (isKnown(trend)) {
    const t = trend.value;
    const word = t.direction === "rising" ? "en hausse" : t.direction === "declining" ? "en baisse" : "stable";
    reasons.push(`Intérêt ${word} (${pct(t.annualGrowthPct)} par an${fromWiki ? ", d'après Wikipédia" : ""}).`);
  }
  if (isKnown(seasonality)) {
    reasons.push(seasonality.value.isSeasonal ? sentence(`Pic en ${months(seasonality.value.peakMonths)}`) : "Demande régulière toute l'année.");
  }
  const s = c.signals;
  if (s && isKnown(s.searchSuggestions)) {
    const g = s.searchSuggestions.value;
    if (g.suggestions.length === 0) reasons.push("Aucune recherche associée : peu de gens tapent ce nom.");
    else if (g.intent.length > 0) reasons.push(`${g.intent.length} recherche${g.intent.length > 1 ? "s" : ""} d'achat (prix, avis…) parmi ${g.suggestions.length}.`);
    else if (g.marketplaces.length > 0) reasons.push(`Déjà cherché sur ${g.marketplaces.length > 1 ? "des marketplaces" : "une marketplace"} (${g.marketplaces[0]}).`);
  }
  if (s?.marginAtPlannedPrice && isKnown(s.marginAtPlannedPrice)) reasons.push(`Marge à ton prix : ${Math.round(s.marginAtPlannedPrice.value)} %.`);
  return reasons.slice(0, 4);
}

/** Scored criteria, strongest first. */
function rankedCriteria(c: CountryAnalysis): CriterionResult[] {
  return c.scoring.criteria.filter((r) => r.status === "scored" && r.normalized !== undefined).toSorted((a, b) => b.normalized! - a.normalized!);
}

function decisionReason(c: CountryAnalysis, decision: Decision): string {
  const ranked = rankedCriteria(c);
  const best = ranked.slice(0, 2).map((r) => lower(r.label));
  const worst = ranked.toReversed().slice(0, 2).map((r) => lower(r.label));
  switch (decision) {
    case "prioritize":
      return best.length > 0 ? `Signaux les plus forts : ${best.join(", ")}.` : "Score et confiance au-dessus des seuils.";
    case "avoid":
      return worst.length > 0 ? `Critères les plus faibles : ${worst.join(", ")}.` : "Score sous le seuil.";
    case "test_carefully":
      return ranked.length >= 2 ? `Signaux mitigés : point fort ${best[0]}, point faible ${worst[0]}.` : "Signaux mitigés.";
    case "exploratory_only": {
      const weakest = c.scoring.confidence.factors.toSorted((a, b) => a.value - b.value)[0];
      return weakest ? `Confiance trop faible : ${lower(weakest.label)}.` : "Confiance trop faible.";
    }
    case "insufficient_data": {
      const labels: Readonly<Record<string, string>> = SOURCE_LABELS;
      const sources = [...new Set(c.dataGaps.flatMap((g) => (labels[g] ? [labels[g]] : [])))].slice(0, 3);
      return sources.length > 0 ? `Données insuffisantes : sources à connecter, ${sources.join(", ")}.` : "Données insuffisantes pour un score.";
    }
  }
}

const DECISION_VALUE: Readonly<Record<Decision, VerdictValue>> = {
  prioritize: "oui",
  avoid: "non",
  test_carefully: "surveiller",
  exploratory_only: "surveiller",
  insufficient_data: "surveiller",
};

export function verdictFor(c: CountryAnalysis): Verdict {
  const blocking = blockingFactors(c);
  const supporting = supportingSignals(c);
  if (blocking.length > 0) return { value: "non", label: LABELS.non, reason: blocking[0]!.message, blocking, supporting, method: "verdict_v1" };
  const value = DECISION_VALUE[c.scoring.decision];
  return { value, label: LABELS[value], reason: decisionReason(c, c.scoring.decision), blocking, supporting, method: "verdict_v1" };
}
