import { describe, expect, it } from "vitest";
import { LOCALES } from "@/i18n/config";
import { analysisInputSchema } from "./schemas";
import { isValidationKey, localizeInputIssues, type RawInputIssue } from "./validation-messages";

const BASE = { productName: "Casquette", countries: ["FR"] };

/** Issues exactly as the pipeline builds them (see parseAnalysisInput). */
function rawIssues(raw: unknown): RawInputIssue[] {
  const result = analysisInputSchema.safeParse(raw);
  return result.success
    ? []
    : result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
        ...(i.code === "custom" && i.params !== undefined && { params: i.params }),
      }));
}

const NBSP = /[  ]/g;
const text = (raw: unknown, locale: (typeof LOCALES)[number]) =>
  localizeInputIssues(rawIssues(raw), locale).map((i) => i.message.replace(NBSP, " "));

describe("localizeInputIssues", () => {
  it("words an amount bound with the locale's currency format", () => {
    const raw = { ...BASE, economics: { currency: "EUR", sellingPrice: 100_000.01 } };
    expect(text(raw, "en")).toEqual(["Selling price: €100,000 at most."]);
    expect(text(raw, "fr")).toEqual(["Prix de vente : 100 000 € au plus."]);
    expect(text(raw, "es")).toEqual(["Precio de venta: 100.000 € como máximo."]);
  });

  it("words the margin range with the locale's percent sign", () => {
    const raw = { ...BASE, economics: { currency: "EUR", targetMarginPct: 99 } };
    expect(text(raw, "en")).toEqual(["Target margin: between 1 and 95%."]);
    expect(text(raw, "fr")).toEqual(["Marge visée : entre 1 et 95 %."]);
  });

  it("names the supplier platform of a non-product page", () => {
    const raw = { ...BASE, supplierUrl: "https://fr.aliexpress.com/store/1102345678" };
    expect(text(raw, "en")).toEqual(["This AliExpress link does not lead to a product page: paste the address of the product page."]);
    expect(text(raw, "es")[0]).toContain("AliExpress");
  });

  it("keeps the key as the code and words a Zod default message as an invalid value", () => {
    const issues = localizeInputIssues([{ path: "countries.0", message: "Invalid option" }, { path: "dataMode", message: "dataMode.mockRemoved" }], "es");
    expect(issues).toEqual([
      { path: "countries.0", code: "invalidValue", message: "Valor no válido." },
      { path: "dataMode", code: "dataMode.mockRemoved", message: "Los datos ficticios se han eliminado de la aplicación." },
    ]);
  });

  it("leaves no placeholder unfilled in any locale", () => {
    const raws = [
      { ...BASE, category: "a" },
      { ...BASE, category: "x".repeat(61) },
      { ...BASE, supplierUrl: `https://a.example/${"a".repeat(2000)}` },
      { ...BASE, hsCode: "12" },
      { ...BASE, economics: { currency: "EUR", supplierPrice: 0, shippingCost: -1, landedCost: Number.NaN } },
    ];
    for (const locale of LOCALES) {
      for (const message of raws.flatMap((raw) => text(raw, locale))) expect(message).not.toMatch(/\{\w+\}/);
    }
  });

  it("recognises only dictionary leaves as keys", () => {
    expect(isValidationKey("productName.forbidden")).toBe(true);
    expect(isValidationKey("productName")).toBe(false);
    expect(isValidationKey("toString")).toBe(false);
  });
});
