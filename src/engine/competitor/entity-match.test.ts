import { describe, expect, it } from "vitest";
import { allowsPriceComparison, matchListings, normaliseGtin, titleSimilarity } from "./entity-match";

describe("normaliseGtin", () => {
  it("compares a UPC-12 and its EAN-13 form equal", () => {
    expect(normaliseGtin("012345678905")).toBe(normaliseGtin("0012345678905"));
  });
  it("refuses what is not a GTIN", () => {
    expect(normaliseGtin("abc")).toBeNull();
    expect(normaliseGtin("123")).toBeNull();
  });
});

describe("matchListings", () => {
  it("matches the same GTIN whatever the titles", () => {
    expect(matchListings({ title: "Gourde inox 750 ml", gtin: "3700123456789" }, { title: "Insulated bottle", gtin: "3700123456789" }).level).toBe("exact_id");
  });

  it("separates two GTINs even with the same title", () => {
    expect(matchListings({ title: "Bottle 750", gtin: "3700123456789" }, { title: "Bottle 750", gtin: "3700123456796" }).level).toBe("different");
  });

  it("matches brand + reference", () => {
    expect(matchListings({ title: "Thermos King 470", brand: "Thermos", mpn: "SK-3000" }, { title: "King food jar", brand: "THERMOS", mpn: "sk3000" }).level).toBe("exact_ref");
  });

  it("calls a close title of the same brand strong", () => {
    const result = matchListings({ title: "Hydro Flask 32 oz Wide Mouth Bottle", brand: "Hydro Flask", price: 44 }, { title: "Hydro Flask Wide Mouth Bottle 32 oz", brand: "hydroflask", price: 40 });
    expect(result.level).toBe("strong");
    expect(allowsPriceComparison(result.level)).toBe(true);
  });

  it("keeps lookalikes without brand uncertain, never comparable", () => {
    const result = matchListings({ title: "Stainless steel water bottle 750ml" }, { title: "Water bottle stainless steel 750ml insulated" });
    expect(result.level).toBe("uncertain");
    expect(allowsPriceComparison(result.level)).toBe(false);
  });

  it("does not call a strong match when prices are far apart", () => {
    const result = matchListings({ title: "Hydro Flask 32 oz Wide Mouth Bottle", brand: "Hydro Flask", price: 44 }, { title: "Hydro Flask 32 oz Wide Mouth Bottle", brand: "Hydro Flask", price: 8 });
    expect(result.level).toBe("uncertain");
    expect(result.reasons).toContain("prices_far_apart");
  });

  it("separates two brands", () => {
    expect(matchListings({ title: "Bottle 750", brand: "Stanley" }, { title: "Bottle 750", brand: "Yeti" }).level).toBe("different");
  });

  it("ignores stop words and accents in titles", () => {
    expect(titleSimilarity("Bouteille isotherme pour café", "bouteille isotherme cafe")).toBe(1);
  });
});
