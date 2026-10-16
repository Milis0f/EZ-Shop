import { describe, expect, it } from "vitest";
import { insufficient, isKnown, observed, type Datum } from "@/domain/datum";
import type { ImportTaxes, MarketplaceListings } from "@/domain/signals";
import type { FxRates, ListingsObservation, SuggestionsObservation, TariffDuties, VatRate } from "@/providers/contracts";
import { TEST_NOW, testSource } from "@/test/fixtures";
import { countryMargin, userValue } from "./economics/market-margin";
import { readMarketplace, readSuggestions } from "./signals/indirect";
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

  it("converts marketplace prices to EUR and computes the China share", () => {
    const prices = [10, 12, 14, 16, 18].map((v) => ({ value: v, currency: "GBP" }));
    const obs: Datum<ListingsObservation> = observed({ marketplaceId: "EBAY_GB", total: 200, prices, chinaTotal: 50, source: testSource("ebay-browse") }, "count", [testSource("ebay-browse")]);
    const read = readMarketplace(obs, fx);
    expect(isKnown(read) && read.value).toMatchObject({ listings: 200, chinaShare: 0.25, priceEur: { median: 16.55 } });
  });
});

describe("margin at market price", () => {
  const listings = (median: number): Datum<MarketplaceListings> =>
    observed({ marketplaceId: "EBAY_FR", listings: 300, sampled: 50, priceEur: { p25: median - 5, median, p75: median + 5 }, localCurrency: "EUR", chinaShare: 0.2 }, "count", [testSource("ebay-browse")]);
  const tax = (duty: number | null): Datum<ImportTaxes> =>
    observed({ regime: "eu", dutyRatePct: { min: 12, max: 12 }, lowValueDutyEur: 3, vatRatePct: 20, dutyPerUnitEur: duty, dutyBasis: "low_value_flat", customsValueEur: 25, notes: [] }, "money", [testSource("uk-trade-tariff")]);

  it("adds the duty to the unit cost and removes VAT from the market price", () => {
    const m = countryMargin(userValue(9, "landed_cost", TEST_NOW.toISOString()), tax(3), listings(30));
    expect(isKnown(m.unitCostEur) && m.unitCostEur.value).toBe(12);
    expect(isKnown(m.marketPriceExVatEur) && m.marketPriceExVatEur.value).toBe(25);
    expect(isKnown(m.marketMarginPct) && m.marketMarginPct.value).toBe(52);
  });

  it("states when duties are unknown rather than pretending they are zero", () => {
    const m = countryMargin(userValue(9, "landed_cost", TEST_NOW.toISOString()), tax(null), listings(30));
    expect(isKnown(m.unitCostEur) && m.unitCostEur.note).toContain("Droits de douane non inclus");
  });

  it("is DATA_INSUFFICIENT without a market price", () => {
    const m = countryMargin(userValue(9, "landed_cost", TEST_NOW.toISOString()), tax(3), insufficient("pas de site", ["ebay_national_site"]));
    expect(m.marketMarginPct.status).toBe("DATA_INSUFFICIENT");
  });
});
