import { describe, expect, it } from "vitest";
import { isKnown, observed, type Datum } from "@/domain/datum";
import type { CountryCode } from "@/domain/country";
import type { TariffDuties, VatRate } from "@/providers/contracts";
import { testSource } from "@/test/fixtures";
import { unitMargins } from "../economics/market-margin";
import { computeImportTaxes } from "./import-taxes";

const collectedAt = "2026-10-30T00:00:00.000Z";
const duties = observed({ ratePctMin: 6, ratePctMax: 6, lowValueFlatEur: null, notes: [], otherMeasures: [], source: testSource("usitc-hts") } as unknown as TariffDuties, "percent", [testSource("usitc-hts")]) as Datum<TariffDuties>;
const fx = observed({ rates: { USD: 1.1, GBP: 0.85 }, date: "2026-10-28", source: testSource("ecb-fx") }, "none", [testSource("ecb-fx")]);
const vat = (country: CountryCode): Datum<VatRate> =>
  observed({ country, standardRatePct: country === "US" ? null : 20, source: testSource("vat-rates") }, "percent", [testSource("vat-rates")]);
const economics = { currency: "EUR" as const, sellingPrice: 40, supplierPrice: 10, shippingCost: 5, targetMarginPct: 30 };

function margins(country: CountryCode, origin: string) {
  const taxes = computeImportTaxes({ country, origin, duties, vat: vat(country), fx, customsValue: { eur: 15, label: "test", input: null } } as Parameters<typeof computeImportTaxes>[0]);
  return { taxes, ...unitMargins({ economics, taxes, vat: vat(country), collectedAt }) };
}

describe("US duties on China origin", () => {
  it("claims no margin: the additional duties can't be computed, so any figure would be too good", () => {
    const { taxes, landedUnitCostEur, marginAtPlannedPrice, minPriceForTargetMargin } = margins("US", "CN");
    if (!isKnown(taxes)) throw new Error("taxes expected");
    expect(taxes.value.dutiesIncomplete).toBe(true);
    expect(taxes.value.notes.join(" ")).toContain("section 301");
    for (const value of [landedUnitCostEur, marginAtPlannedPrice, minPriceForTargetMargin]) {
      expect(value).toMatchObject({ status: "DATA_INSUFFICIENT", missing: ["us_additional_duties"] });
    }
  });

  it("still gives the margin for another origin, or for China to another market", () => {
    expect(isKnown(margins("US", "VN").marginAtPlannedPrice)).toBe(true);
    expect(isKnown(margins("GB", "CN").marginAtPlannedPrice)).toBe(true);
  });
});
