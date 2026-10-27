import type { UnitEconomics } from "@/domain/analysis";
import { derived, insufficient, isKnown, type Datum, type Known, type Unit } from "@/domain/datum";
import type { SourceRef } from "@/domain/provenance";
import type { ImportTaxes, MinimumPrice, SourcingOffer } from "@/domain/signals";
import type { FxRates, SourcingObservation, VatRate } from "@/providers/contracts";
import { quantile } from "../stats/descriptive";
import { round } from "../stats/normalize";

/** A value typed in the form: a choice of the user, not a measurement. */
export function userValue(value: number, field: string, collectedAt: string, unit: Unit = "money"): Known<number> {
  const source: SourceRef = { sourceId: "user-input", origin: "user", collectedAt, connectorVersion: "form", queryRef: field };
  return { status: "known", kind: "assumption", value, unit, sources: [source], note: "Saisi dans le formulaire." };
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

export interface UnitMarginInputs {
  readonly economics: UnitEconomics;
  readonly taxes: Datum<ImportTaxes>;
  readonly vat: Datum<VatRate>;
  readonly collectedAt: string;
}

export interface UnitMargins {
  readonly landedUnitCostEur: Datum<number>;
  readonly marginAtPlannedPrice: Datum<number>;
  readonly minPriceForTargetMargin: Datum<MinimumPrice>;
}

/** Landed unit cost = supplier price + shipping cost + duty per unit, from the owner's inputs only. */
function landedUnitCost(economics: UnitEconomics, taxes: Datum<ImportTaxes>, collectedAt: string): Datum<number> {
  const { supplierPrice, shippingCost } = economics;
  if (supplierPrice === undefined || shippingCost === undefined) {
    return insufficient("Coût de revient inconnu : saisis le prix fournisseur et les frais de livraison.", [...(supplierPrice === undefined ? ["supplier_price"] : []), ...(shippingCost === undefined ? ["shipping_cost"] : [])]);
  }
  const inputs: Array<Known<unknown>> = [userValue(supplierPrice, "supplier_price", collectedAt), userValue(shippingCost, "shipping_cost", collectedAt)];
  const duty = isKnown(taxes) ? taxes.value.dutyPerUnitEur : null;
  if (duty !== null && isKnown(taxes)) inputs.push(taxes);
  const note =
    duty === null
      ? "Prix fournisseur et livraison saisis par toi, droits non inclus (non calculables pour ce pays)."
      : duty > 0
        ? `Prix fournisseur et livraison saisis par toi, plus ${round(duty, 2)} € de droits de douane par unité.`
        : "Prix fournisseur et livraison saisis par toi ; aucun droit de douane dû sur une unité.";
  return derived(round(supplierPrice + shippingCost + (duty ?? 0), 2), "money", { method: "landed_unit_cost_v1", inputs, note });
}

/** VAT rate of the country as a factor: 1 without national VAT, null when unknown. */
function vatFactor(vat: Datum<VatRate>): number | null {
  if (!isKnown(vat)) return null;
  return vat.value.standardRatePct === null ? 1 : 1 + vat.value.standardRatePct / 100;
}

/** Margins from real inputs only: no marketplace price is ever used. */
export function unitMargins({ economics, taxes, vat, collectedAt }: UnitMarginInputs): UnitMargins {
  const landedUnitCostEur = landedUnitCost(economics, taxes, collectedAt);
  const factor = vatFactor(vat);
  const vatInputs: Array<Known<unknown>> = isKnown(vat) ? [vat] : [];

  let marginAtPlannedPrice: Datum<number>;
  if (economics.sellingPrice === undefined) marginAtPlannedPrice = insufficient("Prix de vente envisagé non renseigné.", ["selling_price"]);
  else if (!isKnown(landedUnitCostEur)) marginAtPlannedPrice = landedUnitCostEur;
  else if (factor === null) marginAtPlannedPrice = insufficient("Taux de TVA du pays inconnu : prix hors TVA non calculable.", ["vat-rates"]);
  else {
    const exVat = economics.sellingPrice / factor;
    marginAtPlannedPrice = derived(round(((exVat - landedUnitCostEur.value) / exVat) * 100, 1), "percent", {
      method: "margin_at_planned_price_v1",
      inputs: [userValue(economics.sellingPrice, "selling_price", collectedAt), landedUnitCostEur, ...vatInputs],
      note: `Marge à ton prix : ${round(exVat, 2)} € hors TVA, avant publicité.`,
    });
  }

  let minPriceForTargetMargin: Datum<MinimumPrice>;
  const target = economics.targetMarginPct;
  if (target === undefined) minPriceForTargetMargin = insufficient("Marge visée non renseignée.", ["target_margin"]);
  else if (!isKnown(landedUnitCostEur)) minPriceForTargetMargin = landedUnitCostEur;
  else {
    const exVatEur = landedUnitCostEur.value / (1 - target / 100);
    minPriceForTargetMargin = derived<MinimumPrice>(
      { exVatEur: round(exVatEur, 2), inclVatEur: factor === null ? null : round(exVatEur * factor, 2) },
      "money",
      {
        method: "min_price_for_target_margin_v1",
        inputs: [userValue(target, "target_margin", collectedAt, "percent"), landedUnitCostEur, ...vatInputs],
        note: `Prix minimum pour ta marge de ${target} %, hors TVA puis TVA du pays incluse.`,
      },
    );
  }

  return { landedUnitCostEur, marginAtPlannedPrice, minPriceForTargetMargin };
}
