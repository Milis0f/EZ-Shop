import { SIMULATION_PARAMS } from "@/config/scoring";
import type { AssumptionSet } from "@/domain/assumption";
import { estimate, insufficient, isKnown, type Datum, type Interval } from "@/domain/datum";
import type { DemandForecast, SalesPotential } from "@/domain/market";
import { normal, type Rng } from "@/lib/random";
import { toInterval } from "../stats/descriptive";
import { logNormalFromP10P90, sampleDistribution, sampleLogNormal } from "../stats/sampling";

/**
 * Pre-launch sales POTENTIAL (not a sales forecast):
 *   orders = Σ forecast monthly searches × capture share × conversion rate
 * Month draws share one z-score (fully correlated): conservative, wide intervals.
 * Requires an ABSOLUTE demand forecast — a relative Trends index cannot produce orders.
 */

const SALES_METHOD = "search_demand_x_capture_x_cvr_monte_carlo_v1";

export function estimateSales(
  forecast: Datum<DemandForecast>,
  assumptions: AssumptionSet,
  sellingPrice: number | undefined,
  rng: Rng,
): SalesPotential {
  if (!isKnown(forecast)) {
    const missing = insufficient("Ventes potentielles : prévision de demande indisponible.", forecast.missing);
    return { monthlyOrders: missing, annualOrders: missing, annualRevenue: missing };
  }
  if (forecast.value.basis !== "absolute_volume") {
    const missing = insufficient("Ventes potentielles : seul un indice relatif est disponible, aucun volume absolu.", [
      "google-ads-keyword-planner",
    ]);
    return { monthlyOrders: missing, annualOrders: missing, annualRevenue: missing };
  }

  const months = forecast.value.points.map((p) => logNormalFromP10P90({ p10: Math.max(p.p10, 1e-3), p90: Math.max(p.p90, 1e-3) }));
  const capture = assumptions.traffic_capture_share.distribution;
  const cvr = assumptions.conversion_rate.distribution;

  const annual: number[] = [];
  for (let i = 0; i < SIMULATION_PARAMS.samples; i += 1) {
    const z = normal(rng);
    const demand = months.reduce((s, d) => s + (d ? sampleLogNormal(d, rng, z) : 0), 0);
    annual.push(demand * sampleDistribution(capture, rng) * sampleDistribution(cvr, rng));
  }
  const annualInterval = toInterval(annual);
  const opts = { method: SALES_METHOD, inputs: [forecast], assumptionKeys: ["traffic_capture_share", "conversion_rate"] };
  const scaled = (i: Interval, f: number): Interval => ({ p10: i.p10 * f, p50: i.p50 * f, p90: i.p90 * f });

  return {
    monthlyOrders: estimate(scaled(annualInterval, 1 / 12), "orders", opts),
    annualOrders: estimate(annualInterval, "orders", opts),
    annualRevenue:
      sellingPrice !== undefined
        ? estimate(scaled(annualInterval, sellingPrice), "money", { ...opts, note: "Chiffre d'affaires TTC potentiel = commandes × prix saisi." })
        : insufficient("Chiffre d'affaires : prix de vente non renseigné.", ["selling_price"]),
  };
}
