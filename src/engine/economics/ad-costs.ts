import { SIMULATION_PARAMS } from "@/config/scoring";
import type { AssumptionSet } from "@/domain/assumption";
import { estimate, insufficient, isKnown, type Datum, type Interval, type Known } from "@/domain/datum";
import type { AdPlatform, ChannelCost } from "@/domain/market";
import type { AdCostObservation, FxRates, KeywordMetrics } from "@/providers/contracts";
import type { Rng } from "@/lib/random";
import { simulate } from "../stats/descriptive";
import { logNormalFromP10P90, logNormalFromP20P80, sampleDistribution, sampleLogNormal, type LogNormal } from "../stats/sampling";

export interface AdCostInputs {
  readonly keywordMetrics: Datum<readonly KeywordMetrics[]>;
  readonly meta: Datum<AdCostObservation>;
  readonly tiktok: Datum<AdCostObservation>;
  /** Google bids come in the Ads account's currency; every amount here is in EUR. */
  readonly fx: Datum<FxRates>;
}

interface CpcModel {
  readonly sample: (rng: Rng) => number;
  readonly interval: Known<Interval>;
}

const roundMoney = (i: Interval): Interval => ({ p10: +i.p10.toFixed(2), p50: +i.p50.toFixed(2), p90: +i.p90.toFixed(2) });

/** How many units of a currency one EUR buys; null when unknown. */
function eurRate(currency: string, fx: Datum<FxRates>): number | null {
  if (currency.toUpperCase() === "EUR") return 1;
  return isKnown(fx) ? (fx.value.rates[currency.toUpperCase()] ?? null) : null;
}

function googleCpc(kp: Datum<readonly KeywordMetrics[]>, fx: Datum<FxRates>, rng: Rng): CpcModel | Datum<never> {
  if (!isKnown(kp)) return insufficient("CPC Google indisponible (Keyword Planner non connecté).", kp.missing);
  const raw = kp.value.filter((m) => m.lowTopOfPageBid !== null && m.highTopOfPageBid !== null && (m.lowTopOfPageBid ?? 0) > 0);
  if (raw.length === 0) return insufficient("Aucune enchère haut de page renvoyée.", ["google-ads-keyword-planner"]);
  const bids = raw.flatMap((m) => {
    const rate = eurRate(m.currency, fx);
    return rate
      ? [
          {
            ...m,
            lowTopOfPageBid: (m.lowTopOfPageBid ?? 0) / rate,
            highTopOfPageBid: (m.highTopOfPageBid ?? 0) / rate,
            averageCpc: m.averageCpc ? m.averageCpc / rate : null,
          },
        ]
      : [];
  });
  if (bids.length === 0) return insufficient("Taux de change indisponible : CPC Google non converti en euros.", ["ecb-fx"]);
  // Volume-weighted bid range across terms.
  const w = bids.map((m) => Math.max(1, m.avgMonthlySearches ?? 1));
  const total = w.reduce((s, v) => s + v, 0);
  const low = bids.reduce((s, m, i) => s + (m.lowTopOfPageBid ?? 0) * w[i], 0) / total;
  const high = bids.reduce((s, m, i) => s + (m.highTopOfPageBid ?? 0) * w[i], 0) / total;
  // The average Google really observed is the centre when it is given; the bid range then only sets the spread.
  const withAverage = bids.filter((m) => m.averageCpc !== null);
  const average =
    withAverage.length > 0
      ? withAverage.reduce((s, m) => s + (m.averageCpc ?? 0) * Math.max(1, m.avgMonthlySearches ?? 1), 0) /
        withAverage.reduce((s, m) => s + Math.max(1, m.avgMonthlySearches ?? 1), 0)
      : null;
  const spread = Math.sqrt(high / low);
  const dist = average !== null ? logNormalFromP20P80(average / spread, average * spread) : logNormalFromP20P80(low, high);
  if (!dist) return insufficient("Fourchette d'enchères incohérente.", ["google-ads-keyword-planner"]);
  const sample = (r: Rng) => sampleLogNormal(dist, r);
  return {
    sample,
    interval: estimate(roundMoney(simulate(SIMULATION_PARAMS.samples, rng, sample)), "money", {
      method: average !== null ? "lognormal_from_average_cpc" : "lognormal_from_top_of_page_bid_p20_p80",
      inputs: [kp],
      note: average !== null ? "CPC moyen observé par Google ; l'écart vient de la fourchette d'enchères." : "Enchère haut de page (P20–P80) utilisée comme proxy du CPC : probablement un majorant.",
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
    channel("google", googleCpc(inputs.keywordMetrics, inputs.fx, rng), assumptions, rng),
    channel("meta", socialCpc("meta", inputs.meta, assumptions, rng), assumptions, rng),
    channel("tiktok", socialCpc("tiktok", inputs.tiktok, assumptions, rng), assumptions, rng),
  ];
}
