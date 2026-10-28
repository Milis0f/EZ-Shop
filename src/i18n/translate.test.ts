import { describe, expect, it } from "vitest";
import { plural, t } from "./translate";

describe("t", () => {
  it("replaces every {name} placeholder", () => {
    expect(t("{count} countries for {product}, {count} scored", { count: 3, product: "Lamp" })).toBe("3 countries for Lamp, 3 scored");
  });

  it("leaves unknown placeholders visible and plain text untouched", () => {
    expect(t("Hello {name}")).toBe("Hello {name}");
    expect(t("No placeholder", { name: "x" })).toBe("No placeholder");
  });

  it("does not treat replacement text as a template", () => {
    expect(t("{a}", { a: "{b}", b: "no" })).toBe("{b}");
  });
});

describe("plural", () => {
  const forms = { zero: "No analysis", one: "{count} analysis", other: "{count} analyses" };

  it("picks the form with the locale's plural rules", () => {
    expect(plural("en", 1, forms)).toBe("1 analysis");
    expect(plural("en", 2, forms)).toBe("2 analyses");
    expect(plural("en", 0, forms)).toBe("No analysis");
  });

  it("follows French rules where 0 and 1 are singular", () => {
    const fr = { one: "{count} pays analysé", other: "{count} pays analysés" };
    expect(plural("fr", 0, fr)).toBe("0 pays analysé");
    expect(plural("fr", 1, fr)).toBe("1 pays analysé");
    expect(plural("es", 0, { one: "{count} país", other: "{count} países" })).toBe("0 países");
  });

  it("accepts a formatted count", () => {
    expect(plural("en", 1200, forms, { count: "1,200" })).toBe("1,200 analyses");
  });
});
