import { SIMULATION_PARAMS } from "@/config/scoring";
import type { AssumptionSet } from "@/domain/assumption";
import { estimate, insufficient, isKnown, type Datum, type Interval, type Known } from "@/domain/datum";
import type { AdPlatform, ChannelCost } from "@/domain/market";
import type { AdCostObservation, KeywordMetrics } from "@/providers/contracts";
import type { Rng } from "@/lib/random";
import { simulate } from "../stats/descriptive";
import { logNormalFromP10P90, logNormalFromP20P80, sampleDistribution, sampleLogNormal, type LogNormal } from "../stats/sampling";

export interface AdCostInputs {
  readonly keywordMetrics: Datum<readonly KeywordMetrics[]>;
  readonly meta: Datum<AdCostObservation>;
  readonly tiktok: Datum<AdCostObservation>;
}

interface CpcModel {
  readonly sample: (rng: Rng) => number;
  readonly interval: Known<Interval>;
}

const roundMoney = (i: Interval): Interval => ({ p10: +i.p10.toFixed(2), p50: +i.p50.toFixed(2), p90: +i.p90.toFixed(2) });

function googleCpc(kp: Datum<readonly KeywordMetrics[]>, rng: Rng): CpcModel | Datum<never> {
  if (!isKnown(kp)) return insufficient("CPC Google indisponible (Keyword Planner non connecté).", kp.missing);
  const bids = kp.value.filter((m) => m.lowTopOfPageBid !== null && m.highTopOfPageBid !== null && (m.lowTopOfPageBid ?? 0) > 0);
  if (bids.length === 0) return insufficient("Aucune enchère haut de page renvoyée.", ["google-ads-keyword-planner"]);
  // Volume-weighted bid range across terms.
  const w = bids.map((m) => Math.max(1, m.avgMonthlySearches ?? 1));
  const total = w.reduce((s, v) => s + v, 0);
  const low = bids.reduce((s, m, i) => s + (m.lowTopOfPageBid ?? 0) * w[i], 0) / total;
  const high = bids.reduce((s, m, i) => s + (m.highTopOfPageBid ?? 0) * w[i], 0) / total;
  const dist = logNormalFromP20P80(low, high);
  if (!dist) return insufficient("Fourchette d'enchères incohérente.", ["google-ads-keyword-planner"]);
  const sample = (r: Rng) => sampleLogNormal(dist, r);
  return {
    sample,
    interval: estimate(roundMoney(simulate(SIMULATION_PARAMS.samples, rng, sample)), "money", {
      method: "lognormal_from_top_of_page_bid_p20_p80",
      inputs: [kp],
      note: "Enchère haut de page (P20–P80) utilisée comme proxy du CPC : probablement un majorant.",
    }),
  };
}

function socialCpc(platform: AdPlatform, cost: Datum<AdCostObservation>, assumptions: AssumptionSet, rng: Rng): CpcModel | Datum<never> {
  if (!isKnown(cost)) return insufficient(`Coût ${platform} indisponible.`, cost.missing);
  const range: LogNormal | null = logNormalFromP10P90({ p10: cost.value.low, p90: cost.value.high });
  if (!range) return insufficient(`Fourchette de coût ${platform} incohérente.`, []);
  const ctr = assumptions.social_ctr.distribution;
  const sample =
    cost.value.metric === "cpc"
      ? (r: Rng) => sampleLogNormal(range, r)
      : (r: Rng) => sampleLogNormal(range, r) / (1000 * Math.max(1e-6, sampleDistribution(ctr, r)));
  return {
    sample,
    interval: estimate(roundMoney(simulate(SIMULATION_PARAMS.samples, rng, sample)), "money", {
      method: cost.value.metric === "cpm" ? "cpm_divided_by_ctr_monte_carlo" : "cpc_lognormal",
      inputs: [cost],
      assumptionKeys: cost.value.metric === "cpm" ? ["social_ctr"] : [],
    }),
  };
}

function channel(platform: AdPlatform, model: CpcModel | Datum<never>, assumptions: AssumptionSet, rng: Rng): ChannelCost {
  if (!("sample" in model)) return { platform, cpc: model, cpa: model, testBudget: model };
  const cvr = assumptions.conversion_rate.distribution;
  const target = assumptions.test_target_conversions.distribution;
  const cpaDraw = (r: Rng) => model.sample(r) / Math.max(1e-6, sampleDistribution(cvr, r));
  const opts = { inputs: [model.interval], assumptionKeys: ["conversion_rate"] as string[] };
  return {
    platform,
    cpc: model.interval,
    cpa: estimate(roundMoney(simulate(SIMULATION_PARAMS.samples, rng, cpaDraw)), "money", { ...opts, method: "cpc_divided_by_cvr_monte_carlo" }),
    testBudget: estimate(
      roundMoney(simulate(SIMULATION_PARAMS.samples, rng, (r) => cpaDraw(r) * sampleDistribution(target, r))),
      "money",
      { ...opts, method: "cpa_times_target_conversions", assumptionKeys: ["conversion_rate", "test_target_conversions"], note: "Budget pour atteindre le nombre de conversions visé — pas une garantie." },
    ),
  };
}

export function estimateAdCosts(inputs: AdCostInputs, assumptions: AssumptionSet, rng: Rng): ChannelCost[] {
  return [
    channel("google", googleCpc(inputs.keywordMetrics, rng), assumptions, rng),
    channel("meta", socialCpc("meta", inputs.meta, assumptions, rng), assumptions, rng),
    channel("tiktok", socialCpc("tiktok", inputs.tiktok, assumptions, rng), assumptions, rng),
  ];
}
