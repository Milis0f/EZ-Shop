import { describe, expect, it } from "vitest";
import { isKnown, observed, type Datum } from "@/domain/datum";
import type { UnitEconomics } from "@/domain/analysis";
import type { ImportTaxes } from "@/domain/signals";
import type { ContentObservation, FxRates, ListingsObservation, SuggestionsObservation, TariffDuties, VatRate } from "@/providers/contracts";
import { TEST_NOW, testSource } from "@/test/fixtures";
import { unitMargins, userValue } from "./economics/market-margin";
import { readContent, readMarketplace, readSuggestions } from "./signals/indirect";
import { computeImportTaxes, type TaxInputs } from "./taxes/import-taxes";

const fx: Datum<FxRates> = observed(
  { date: "2026-10-15", rates: { EUR: 1, GBP: 0.8461, USD: 1.1208, AUD: 1.6218 }, source: testSource("ecb-fx") },
  "none",
  [testSource("ecb-fx")],
);
const vat = (country: VatRate["country"], rate: number | null): Datum<VatRate> =>
  observed({ country, standardRatePct: rate, source: testSource("vat-rates") }, "percent", [testSource("vat-rates")]);
const duties = (regime: TariffDuties["regime"], min: number, max: number, lowValue: number | null = null): Datum<TariffDuties> =>
  observed(
    { regime, code: "611595", ratePctMin: min, ratePctMax: max, lowValueFlatEur: lowValue, otherMeasures: [], notes: [], source: testSource("uk-trade-tariff") },
    "none",
    [testSource("uk-trade-tariff")],
  );
const value = (eur: number): TaxInputs["customsValue"] => ({ eur, label: "prix de vente HT saisi", input: userValue(eur, "selling_price", TEST_NOW.toISOString()) });
const taxes = (overrides: Partial<TaxInputs>): ImportTaxes => {
  const result = computeImportTaxes({ country: "FR", origin: "CN", duties: duties("eu", 12, 12, 3), vat: vat("FR", 20), fx, customsValue: value(25), ...overrides });
  if (!isKnown(result)) throw new Error(result.reason);
  return result.value;
};

describe("import taxes", () => {
  it("EU under €150: the temporary €3 flat duty per item, VAT rate kept apart", () => {
    expect(taxes({})).toMatchObject({ regime: "eu", dutyBasis: "low_value_flat", dutyPerUnitEur: 3, vatRatePct: 20, dutyRatePct: { min: 12, max: 12 } });
  });

  it("EU at €150 or more: ad valorem duty at the highest rate of the range", () => {
    expect(taxes({ duties: duties("eu", 8, 12, 3), customsValue: value(200) })).toMatchObject({ dutyBasis: "ad_valorem", dutyPerUnitEur: 24 });
  });

  it("EU origin into the EU: customs union, no duty", () => {
    expect(taxes({ origin: "DE" })).toMatchObject({ dutyBasis: "customs_union", dutyPerUnitEur: 0 });
  });

  it("GB up to £135: no customs duty", () => {
    expect(taxes({ country: "GB", duties: duties("gb", 12, 12), vat: vat("GB", 20), customsValue: value(100) })).toMatchObject({ dutyBasis: "exempt_low_value", dutyPerUnitEur: 0 });
    expect(taxes({ country: "GB", duties: duties("gb", 12, 12), vat: vat("GB", 20), customsValue: value(200) })).toMatchObject({ dutyBasis: "ad_valorem", dutyPerUnitEur: 24 });
  });

  it("US: duty from the first dollar, no national VAT", () => {
    expect(taxes({ country: "US", duties: duties("us", 10, 13.5), vat: vat("US", null), customsValue: value(20) })).toMatchObject({ dutyBasis: "ad_valorem", dutyPerUnitEur: 2.7, vatRatePct: null });
  });

  it("Switzerland and Canada: duty reported as unknown, never guessed", () => {
    expect(taxes({ country: "CH", duties: null, vat: vat("CH", 8.1) })).toMatchObject({ dutyBasis: "unknown", dutyPerUnitEur: null, vatRatePct: 8.1 });
  });

  it("Australia under A$1,000: no duty", () => {
    expect(taxes({ country: "AU", duties: null, vat: vat("AU", 10), customsValue: value(40) })).toMatchObject({ dutyBasis: "exempt_low_value", dutyPerUnitEur: 0 });
  });

  it("without an origin, duties are DATA_INSUFFICIENT", () => {
    const result = computeImportTaxes({ country: "FR", origin: undefined, duties: duties("eu", 12, 12, 3), vat: vat("FR", 20), fx, customsValue: value(25) });
    expect(isKnown(result) ? [] : result.missing).toEqual(["origin_country"]);
  });
});

describe("indirect signals", () => {
  it("separates purchase intent and marketplaces in suggestions", () => {
    const obs: Datum<SuggestionsObservation> = observed(
      { suggestions: ["chaussettes chauffantes", "chaussettes chauffantes avis", "chaussettes chauffantes amazon", "chaussettes chauffantes pas cher"], source: testSource("google-autocomplete") },
      "count",
      [testSource("google-autocomplete")],
    );
    const read = readSuggestions(obs, "fr");
    expect(isKnown(read) && read.value.intent).toEqual(["chaussettes chauffantes avis", "chaussettes chauffantes pas cher"]);
    expect(isKnown(read) && read.value.marketplaces).toEqual(["chaussettes chauffantes amazon"]);
  });

  it("computes the China share of the listings", () => {
    const prices = [10, 12, 14, 16, 18].map((v) => ({ value: v, currency: "GBP" }));
    const obs: Datum<ListingsObservation> = observed({ marketplaceId: "EBAY_GB", total: 200, prices, chinaTotal: 50, source: testSource("ebay-browse") }, "count", [testSource("ebay-browse")]);
    const read = readMarketplace(obs);
    expect(isKnown(read) && read.value).toMatchObject({ listings: 200, chinaShare: 0.25 });
  });
});

describe("unit margins from the owner's inputs", () => {
  const at = TEST_NOW.toISOString();
  const tax = (duty: number | null): Datum<ImportTaxes> =>
    observed({ regime: "eu", dutyRatePct: { min: 12, max: 12 }, lowValueDutyEur: 3, vatRatePct: 20, dutyPerUnitEur: duty, dutyBasis: "low_value_flat", customsValueEur: 25, notes: [] }, "money", [testSource("uk-trade-tariff")]);
  const economics = (overrides: Partial<UnitEconomics> = {}): UnitEconomics => ({ currency: "EUR", supplierPrice: 8, shippingCost: 3, ...overrides });
  const margins = (e: UnitEconomics, duty: number | null = 3, rate: number | null = 20) =>
    unitMargins({ economics: e, taxes: tax(duty), vat: vat("FR", rate), collectedAt: at });

  it("landed cost adds supplier price, shipping and the duty per unit", () => {
    const { landedUnitCostEur } = margins(economics());
    expect(isKnown(landedUnitCostEur) && landedUnitCostEur).toMatchObject({ value: 14, kind: "derived" });
    expect(isKnown(landedUnitCostEur) && landedUnitCostEur.sources.some((s) => s.origin === "user")).toBe(true);
  });

  it("landed cost without duties says so", () => {
    const { landedUnitCostEur } = margins(economics(), null);
    expect(isKnown(landedUnitCostEur) && landedUnitCostEur.value).toBe(11);
    expect(isKnown(landedUnitCostEur) && landedUnitCostEur.note).toContain("droits non inclus");
  });

  it("margin at the planned price removes the country VAT", () => {
    const { marginAtPlannedPrice } = margins(economics({ sellingPrice: 30 }));
    expect(isKnown(marginAtPlannedPrice) && marginAtPlannedPrice.value).toBe(44);
    expect(isKnown(marginAtPlannedPrice) && marginAtPlannedPrice.note).toContain("à ton prix");
  });

  it("margin at the planned price can be negative", () => {
    const { marginAtPlannedPrice } = margins(economics({ sellingPrice: 12 }));
    expect(isKnown(marginAtPlannedPrice) && marginAtPlannedPrice.value).toBe(-40);
  });

  it("minimum price for a 40 % target, excluding then including VAT", () => {
    const { minPriceForTargetMargin } = margins(economics({ targetMarginPct: 40 }));
    expect(isKnown(minPriceForTargetMargin) && minPriceForTargetMargin.value).toEqual({ exVatEur: 23.33, inclVatEur: 28 });
  });

  it("without a price the margins are DATA_INSUFFICIENT", () => {
    const m = margins({ currency: "EUR" });
    expect(m.landedUnitCostEur.status).toBe("DATA_INSUFFICIENT");
    expect(m.marginAtPlannedPrice.status).toBe("DATA_INSUFFICIENT");
    expect(m.minPriceForTargetMargin.status).toBe("DATA_INSUFFICIENT");
  });
});

describe("no derived marketplace statistics", () => {
  it("eBay keeps the count, at most five observed prices and the China total", () => {
    const prices = [10, 12, 14, 16, 18, 20, 22].map((v) => ({ value: v, currency: "GBP" }));
    const obs: Datum<ListingsObservation> = observed({ marketplaceId: "EBAY_GB", total: 200, prices, chinaTotal: 50, source: testSource("ebay-browse") }, "count", [testSource("ebay-browse")]);
    const read = readMarketplace(obs);
    expect(isKnown(read) && read.value.observedPrices).toEqual(prices.slice(0, 5));
    expect(isKnown(read) && read.value).toMatchObject({ listings: 200, chinaTotal: 50 });
    expect(isKnown(read) && read.value.priceEur).toBeUndefined();
  });

  it("YouTube keeps the result count and the videos, without median views", () => {
    const videos = [{ id: "a", publishedAt: "2026-09-01T00:00:00Z", views: 1200 }];
    const obs: Datum<ContentObservation> = observed({ totalResults: 40, videos, source: testSource("youtube-data") }, "count", [testSource("youtube-data")]);
    const read = readContent(obs, TEST_NOW);
    expect(isKnown(read) && read.value).toMatchObject({ videosLast12Months: 40, videos, medianViews: null });
  });
});
