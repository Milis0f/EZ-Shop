import type { CountryAnalysis } from "@/domain/analysis";
import { isKnown } from "@/domain/datum";
import type { TrendDirection } from "@/domain/market";
import type { CriterionResult, Decision } from "@/domain/scoring";
import { SOURCE_LABELS } from "@/lib/format";
import { reasonText, verdictWord } from "./localize";

/**
 * Verdict rule `verdict_v1`: a presentation of the existing decision plus blocking factors computed only
 * from real inputs. Score, weights and thresholds are unchanged. A missing margin is never blocking.
 * Reasons are codes with their raw parameters; ./localize renders them in the active locale.
 */

export type VerdictValue = "oui" | "non" | "surveiller";
export type VerdictLabel = "OUI" | "NON" | "À SURVEILLER";

/** A criterion or confidence factor named in a reason: its id (translated at display) and its engine label (fallback). */
export interface LabelRef {
  readonly id: string;
  readonly label: string;
}

export type Reason =
  | { readonly code: "loss_at_planned_price"; readonly marginPct: number; readonly dutyIncluded: boolean }
  | { readonly code: "below_target_margin"; readonly targetMarginPct: number; readonly exVatEur: number; readonly inclVatEur: number | null }
  | { readonly code: "no_demand_data" }
  | { readonly code: "interest_trend"; readonly direction: TrendDirection; readonly annualGrowthPct: number; readonly fromWikipedia: boolean }
  | { readonly code: "seasonal_peak"; readonly months: readonly number[] }
  | { readonly code: "steady_demand" }
  | { readonly code: "no_related_searches" }
  | { readonly code: "buying_searches"; readonly count: number; readonly total: number }
  | { readonly code: "marketplace_searches"; readonly count: number; readonly first: string }
  | { readonly code: "margin_at_price"; readonly marginPct: number }
  | { readonly code: "strongest_signals"; readonly criteria: readonly LabelRef[] }
  | { readonly code: "above_thresholds" }
  | { readonly code: "weakest_criteria"; readonly criteria: readonly LabelRef[] }
  | { readonly code: "below_threshold" }
  | { readonly code: "mixed_signals"; readonly best: LabelRef | null; readonly worst: LabelRef | null }
  | { readonly code: "low_confidence"; readonly factor: LabelRef | null }
  | { readonly code: "insufficient_data"; readonly sources: readonly string[] };

export type ReasonCode = Reason["code"];

export interface BlockingFactor {
  readonly id: "loss_at_planned_price" | "below_target_margin" | "no_demand_data";
  readonly cause: Reason;
  /** French text of `cause`, for callers not translated yet (the AI fact sheet). */
  readonly message: string;
}

export interface Verdict {
  readonly value: VerdictValue;
  /** French verdict word; screens use verdictWord(value, locale). */
  readonly label: VerdictLabel;
  /** Decisive reason: the first blocking factor, else the reason of the decision. */
  readonly cause: Reason;
  /** French text of `cause`. */
  readonly reason: string;
  readonly blocking: readonly BlockingFactor[];
  /** Supporting signals, as codes. */
  readonly signals: readonly Reason[];
  /** French text of `signals`. */
  readonly supporting: readonly string[];
  readonly method: "verdict_v1";
}

const fr = (reason: Reason) => reasonText(reason, "fr");

/** Blocking factors, each only from real inputs and data. */
export function blockingFactors(c: CountryAnalysis): BlockingFactor[] {
  const causes: { id: BlockingFactor["id"]; cause: Reason }[] = [];
  const margin = c.signals?.marginAtPlannedPrice;
  const minimum = c.signals?.minPriceForTargetMargin;
  if (margin && isKnown(margin) && margin.value < 0) {
    causes.push({ id: "loss_at_planned_price", cause: { code: "loss_at_planned_price", marginPct: margin.value, dutyIncluded: dutyIncluded(c) } });
  }
  if (margin && isKnown(margin) && minimum && isKnown(minimum) && margin.value < minimum.value.targetMarginPct) {
    const { exVatEur, inclVatEur, targetMarginPct } = minimum.value;
    causes.push({ id: "below_target_margin", cause: { code: "below_target_margin", targetMarginPct, exVatEur, inclVatEur } });
  }
  if (!hasDemandData(c)) causes.push({ id: "no_demand_data", cause: { code: "no_demand_data" } });
  return causes.map(({ id, cause }) => ({ id, cause, message: fr(cause) }));
}

/** What the landed cost holds, as `landedUnitCost` builds it: duties only when they could be computed. */
function dutyIncluded(c: CountryAnalysis): boolean {
  const taxes = c.signals?.taxes;
  return taxes !== undefined && isKnown(taxes) && taxes.value.dutyPerUnitEur !== null;
}

function hasDemandData(c: CountryAnalysis): boolean {
  const s = c.signals;
  return (
    isKnown(c.demand.avgMonthlySearches) ||
    isKnown(c.demand.history) ||
    (s !== undefined && (isKnown(s.searchSuggestions) || isKnown(s.content) || isKnown(s.topicInterest)))
  );
}

/** Plain-language signals from the data that exists, as codes; nothing estimated here. */
export function supportingReasons(c: CountryAnalysis): Reason[] {
  const reasons: Reason[] = [];
  const { trend, seasonality } = c.demand;
  const fromWikipedia = isKnown(c.demand.history) && c.demand.history.value.basis === "topic_interest";
  if (isKnown(trend)) {
    reasons.push({ code: "interest_trend", direction: trend.value.direction, annualGrowthPct: trend.value.annualGrowthPct, fromWikipedia });
  }
  if (isKnown(seasonality)) {
    reasons.push(seasonality.value.isSeasonal ? { code: "seasonal_peak", months: seasonality.value.peakMonths } : { code: "steady_demand" });
  }
  const s = c.signals;
  if (s && isKnown(s.searchSuggestions)) {
    const g = s.searchSuggestions.value;
    const firstMarketplace = g.marketplaces[0];
    if (g.suggestions.length === 0) reasons.push({ code: "no_related_searches" });
    else if (g.intent.length > 0) reasons.push({ code: "buying_searches", count: g.intent.length, total: g.suggestions.length });
    else if (firstMarketplace !== undefined) reasons.push({ code: "marketplace_searches", count: g.marketplaces.length, first: firstMarketplace });
  }
  if (s?.marginAtPlannedPrice && isKnown(s.marginAtPlannedPrice)) reasons.push({ code: "margin_at_price", marginPct: s.marginAtPlannedPrice.value });
  return reasons.slice(0, 4);
}

/** French text of the supporting signals. */
export const supportingSignals = (c: CountryAnalysis): string[] => supportingReasons(c).map(fr);

/** Scored criteria, strongest first. */
function rankedCriteria(c: CountryAnalysis): CriterionResult[] {
  return c.scoring.criteria.filter((r) => r.status === "scored" && r.normalized !== undefined).toSorted((a, b) => b.normalized! - a.normalized!);
}

const ref = (r: { readonly id: string; readonly label: string }): LabelRef => ({ id: r.id, label: r.label });

function decisionReason(c: CountryAnalysis, decision: Decision): Reason {
  const ranked = rankedCriteria(c);
  const best = ranked.slice(0, 2).map(ref);
  const worst = ranked.toReversed().slice(0, 2).map(ref);
  switch (decision) {
    case "prioritize":
      return best.length > 0 ? { code: "strongest_signals", criteria: best } : { code: "above_thresholds" };
    case "avoid":
      return worst.length > 0 ? { code: "weakest_criteria", criteria: worst } : { code: "below_threshold" };
    case "test_carefully":
      return { code: "mixed_signals", best: ranked.length >= 2 ? (best[0] ?? null) : null, worst: ranked.length >= 2 ? (worst[0] ?? null) : null };
    case "exploratory_only": {
      const weakest = c.scoring.confidence.factors.toSorted((a, b) => a.value - b.value)[0];
      return { code: "low_confidence", factor: weakest ? ref(weakest) : null };
    }
    case "insufficient_data": {
      const known = (g: string) => Object.prototype.hasOwnProperty.call(SOURCE_LABELS, g);
      return { code: "insufficient_data", sources: [...new Set(c.dataGaps.filter(known))].slice(0, 3) };
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
  const signals = supportingReasons(c);
  const value: VerdictValue = blocking.length > 0 ? "non" : DECISION_VALUE[c.scoring.decision];
  const cause = blocking[0]?.cause ?? decisionReason(c, c.scoring.decision);
  return {
    value,
    label: verdictWord(value, "fr") as VerdictLabel,
    cause,
    reason: fr(cause),
    blocking,
    signals,
    supporting: signals.map(fr),
    method: "verdict_v1",
  };
}
