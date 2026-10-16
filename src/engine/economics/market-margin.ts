import type { UnitEconomics } from "@/domain/analysis";
import { derived, insufficient, isKnown, type Datum, type Known } from "@/domain/datum";
import type { SourceRef } from "@/domain/provenance";
import type { ImportTaxes, MarketplaceListings, SourcingOffer } from "@/domain/signals";
import type { FxRates, SourcingObservation } from "@/providers/contracts";
import { quantile } from "../stats/descriptive";
import { round } from "../stats/normalize";

/** A value typed in the form: a choice of the user, not a measurement. */
export function userValue(value: number, field: string, collectedAt: string): Known<number> {
  const source: SourceRef = { sourceId: "user-input", origin: "user", collectedAt, connectorVersion: "form", queryRef: field };
  return { status: "known", kind: "assumption", value, unit: "money", sources: [source], note: "Saisi dans le formulaire." };
}

/** AliExpress offers converted to EUR (the query already asks for EUR; other currencies use ECB rates). */
export function readSourcing(obs: Datum<SourcingObservation>, fx: Datum<FxRates>): Datum<SourcingOffer> {
  if (!isKnown(obs)) return obs;
  const rates = isKnown(fx) ? fx.value.rates : { EUR: 1 };
  const products = obs.value.products.flatMap((p) => {
    const rate = rates[p.currency.toUpperCase()];
    return rate ? [{ ...p, priceEur: round(p.price / rate, 2) }] : [];
  });
  if (products.length < 3) return insufficient("AliExpress : moins de 3 produits exploitables pour ces termes.", ["aliexpress-affiliate"]);
  const prices = products.map((p) => p.priceEur);
  const orders = products.flatMap((p) => (p.orders === null ? [] : [p.orders]));
  return derived<SourcingOffer>(
    {
      products: obs.value.totalProducts,
      sampled: products.length,
      priceEur: { p25: round(quantile(prices, 0.25), 2), median: round(quantile(prices, 0.5), 2), p75: round(quantile(prices, 0.75), 2) },
      recentOrders: orders.length > 0 ? orders.reduce((s, o) => s + o, 0) : null,
      topProducts: products.slice(0, 3).map((p) => ({ title: p.title, priceEur: p.priceEur, orders: p.orders, rating: p.rating, url: p.url })),
    },
    "money",
    {
      method: "aliexpress_top_sellers_sample_v1",
      inputs: isKnown(fx) ? [obs, fx] : [obs],
      note: "Produits triés par ventes récentes ; prix hors frais de livraison.",
    },
  );
}

/** Cost of one unit before duties: the cost typed by the user, else the median AliExpress price. */
export function baseUnitCost(economics: UnitEconomics, sourcing: Datum<SourcingOffer>, collectedAt: string): { datum: Datum<number>; label: string } {
  if (economics.landedCost !== undefined) return { datum: userValue(economics.landedCost, "landed_cost", collectedAt), label: "coût de revient saisi" };
  if (isKnown(sourcing)) {
    return {
      datum: derived(sourcing.value.priceEur.median, "money", {
        method: "aliexpress_median_price",
        inputs: [sourcing],
        note: "Prix médian des produits AliExpress les plus vendus, livraison non incluse : saisis ton coût de revient pour plus de précision.",
      }),
      label: "prix AliExpress médian",
    };
  }
  return { datum: insufficient("Coût unitaire inconnu : saisis le coût de revient ou connecte AliExpress.", ["landed_cost", "aliexpress-affiliate"]), label: "" };
}

export interface CountryMargin {
  readonly unitCostEur: Datum<number>;
  readonly marketPriceExVatEur: Datum<number>;
  readonly marketMarginPct: Datum<number>;
}

/**
 * Unit cost in a country = base unit cost + duty per unit. Market price excl. VAT = median eBay price / (1 + VAT).
 * Margin = (market price excl. VAT − unit cost) / market price excl. VAT, before advertising and shipping.
 */
export function countryMargin(base: Datum<number>, taxes: Datum<ImportTaxes>, marketplace: Datum<MarketplaceListings>): CountryMargin {
  const duty = isKnown(taxes) ? taxes.value.dutyPerUnitEur : null;
  const unitCostEur: Datum<number> = !isKnown(base)
    ? base
    : duty === null
      ? { ...base, note: `${base.note ?? ""} Droits de douane non inclus (non calculables pour ce pays).`.trim() }
      : derived(round(base.value + duty, 2), "money", {
          method: "unit_cost_plus_duty_per_unit",
          inputs: isKnown(taxes) ? [base, taxes] : [base],
          note: duty > 0 ? `Dont ${round(duty, 2)} € de droits de douane par unité.` : "Aucun droit de douane dû sur une unité.",
        });

  let marketPriceExVatEur: Datum<number>;
  if (!isKnown(marketplace)) marketPriceExVatEur = marketplace;
  else if (!marketplace.value.priceEur) marketPriceExVatEur = insufficient("Prix de marché : trop peu d'annonces avec un prix.", ["ebay-browse"]);
  else {
    const vat = isKnown(taxes) ? taxes.value.vatRatePct : null;
    const median = marketplace.value.priceEur.median;
    marketPriceExVatEur = derived(round(vat === null ? median : median / (1 + vat / 100), 2), "money", {
      method: "marketplace_median_price_excl_vat",
      inputs: isKnown(taxes) ? [marketplace, taxes] : [marketplace],
      note: vat === null ? "Prix affichés hors taxe de vente (pas de TVA nationale)." : `Prix médian eBay hors TVA (${vat} %).`,
    });
  }

  const marketMarginPct: Datum<number> =
    isKnown(unitCostEur) && isKnown(marketPriceExVatEur) && marketPriceExVatEur.value > 0
      ? derived(round(((marketPriceExVatEur.value - unitCostEur.value) / marketPriceExVatEur.value) * 100, 1), "percent", {
          method: "market_margin_before_ads",
          inputs: [unitCostEur, marketPriceExVatEur],
          note: "Marge au prix du marché, avant publicité et frais de livraison.",
        })
      : insufficient("Marge au prix du marché non calculable.", [
          ...(isKnown(unitCostEur) ? [] : unitCostEur.missing),
          ...(isKnown(marketPriceExVatEur) ? [] : marketPriceExVatEur.missing),
        ]);

  return { unitCostEur, marketPriceExVatEur, marketMarginPct };
}
