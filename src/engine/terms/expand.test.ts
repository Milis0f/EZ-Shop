import { describe, expect, it } from "vitest";
import { canonicalKey, expandProduct, orthographicVariants, termsForCountry } from "./expand";

describe("term expansion", () => {
  it("builds a stable canonical key", () => {
    expect(canonicalKey("  Chaussettes   Chauffantes ")).toBe("chaussettes-chauffantes");
    expect(canonicalKey("Crème Solaire")).toBe("creme-solaire");
  });

  it("generates orthographic variants without touching multi-word terms' plurals", () => {
    expect(orthographicVariants("chaussette", "fr")).toEqual(["chaussettes"]);
    expect(orthographicVariants("chapeau", "fr")).toEqual(["chapeaux"]);
    expect(orthographicVariants("crème solaire", "fr")).toEqual(["creme solaire"]);
    expect(orthographicVariants("socken", "de")).toEqual([]);
  });

  const product = expandProduct({
    productName: "Chaussettes chauffantes",
    inputLanguage: "fr",
    extraTerms: [
      { language: "de", term: "Beheizbare Socken" },
      { language: "en", term: "heated socks" },
    ],
  });

  it("tags user translations and rule variants distinctly", () => {
    expect(product.terms.find((t) => t.term === "beheizbare socken")).toMatchObject({ kind: "translation", source: "user" });
    expect(product.terms.every((t) => t.kind !== "variant" || t.source === "rules")).toBe(true);
  });

  it("picks terms in the country's languages and flags mismatches", () => {
    expect(termsForCountry(product, "DE")).toMatchObject({ language: "de", languageMismatch: false });
    expect(termsForCountry(product, "CA").language).toBe("en");
    const it = termsForCountry(product, "IT");
    expect(it.languageMismatch).toBe(true);
    expect(it.queryTerms.map((t) => t.term)).toEqual(["chaussettes chauffantes"]);
  });

  it("never queries orthographic variants (avoids double counting)", () => {
    expect(termsForCountry(product, "FR").queryTerms.every((t) => t.kind !== "variant")).toBe(true);
  });
});
