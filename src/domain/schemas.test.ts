import { describe, expect, it } from "vitest";
import { analysisInputSchema } from "./schemas";

const parse = (productName: string) => analysisInputSchema.safeParse({ productName, countries: ["FR"] });

describe("analysisInputSchema user text", () => {
  it("rejects NUL in a product name with the forbidden-character message key", () => {
    const result = parse("Lampe\u0000LED");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["productName"],
        message: "productName.forbidden",
      });
    }
  });

  it.each(["\u0000", "\u000B"])(
    "reports only the forbidden-character issue for a product name made of nothing else (%j)",
    (productName) => {
      const result = parse(productName);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toHaveLength(1);
        expect(result.error.issues[0]).toMatchObject({
          path: ["productName"],
          message: "productName.forbidden",
        });
      }
    },
  );

  it("rejects a lone high surrogate in a product name", () => {
    const result = parse("Lampe \ud800");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["productName"],
        message: "productName.forbidden",
      });
    }
  });

  it("rejects a lone low surrogate in a product name", () => {
    const result = parse("Lampe \udc00");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["productName"],
        message: "productName.forbidden",
      });
    }
  });

  it("rejects control characters in an extra term", () => {
    const result = analysisInputSchema.safeParse({
      productName: "Lampe LED",
      countries: ["FR"],
      extraTerms: [{ language: "de", term: "Lampe\u0007" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["extraTerms", 0, "term"],
        message: "extraTerm.forbidden",
      });
    }
  });

  it.each(["\u000BLampe", "Lampe\u000B", "\u000CLampe", "Lampe\u000C"])(
    "rejects vertical tab and form feed before trimming (%j)",
    (productName) => {
      const result = parse(productName);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]).toMatchObject({
          path: ["productName"],
          message: "productName.forbidden",
        });
      }
    },
  );

  it("normalizes tabs and line breaks to one space", () => {
    const result = parse("\tLampe\r\nLED ");
    expect(result).toMatchObject({ success: true, data: { productName: "Lampe LED" } });
  });

  it("keeps accents, emoji and repeated spaces unchanged", () => {
    const result = parse("Lampe  LED ❄️ été");
    expect(result).toMatchObject({ success: true, data: { productName: "Lampe  LED ❄️ été" } });
  });
});

const BASE = { productName: "Casquette", countries: ["FR"] };
const PRODUCT_URL = "https://fr.aliexpress.com/item/1005006123456789.html?spm=a2g0o.home";

/** Issues as the pipeline reports them: dotted path and message key. */
function issuesOf(raw: unknown): Array<{ path: string; message: string }> {
  const result = analysisInputSchema.safeParse(raw);
  return result.success ? [] : result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

describe("analysisInputSchema supplier URL", () => {
  it("keeps a recognised product page address", () => {
    const result = analysisInputSchema.safeParse({ ...BASE, supplierUrl: PRODUCT_URL });
    expect(result).toMatchObject({ success: true, data: { supplierUrl: PRODUCT_URL } });
  });

  it("accepts 2000 characters and refuses 2001", () => {
    const prefix = "https://fr.aliexpress.com/item/1005006123456789.html?q=";
    const atLimit = prefix + "a".repeat(2000 - prefix.length);

    expect(analysisInputSchema.safeParse({ ...BASE, supplierUrl: atLimit })).toMatchObject({ success: true, data: { supplierUrl: atLimit } });
    expect(issuesOf({ ...BASE, supplierUrl: `${atLimit}a` })).toEqual([{ path: "supplierUrl", message: expect.any(String) }]);
  });

  it("refuses a short link with the short-link message key", () => {
    expect(issuesOf({ ...BASE, supplierUrl: "https://s.click.aliexpress.com/e/_DmXyZ12" })).toEqual([
      { path: "supplierUrl", message: "supplierUrl.shortLink" },
    ]);
  });

  it("refuses a non-web address with the not-web message key", () => {
    expect(issuesOf({ ...BASE, supplierUrl: "javascript:alert(1)" })).toEqual([
      { path: "supplierUrl", message: "supplierUrl.notWeb" },
    ]);
  });

  it("accepts an address that is not a supplier page", () => {
    const result = analysisInputSchema.safeParse({ ...BASE, supplierUrl: "https://www.amazon.fr/dp/B0C1234567" });
    expect(result).toMatchObject({ success: true, data: { supplierUrl: "https://www.amazon.fr/dp/B0C1234567" } });
  });

  it.each(["", "   "])("treats a blank address as no address (%j)", (supplierUrl) => {
    const result = analysisInputSchema.safeParse({ ...BASE, supplierUrl });
    expect(result.success).toBe(true);
    expect(result.data?.supplierUrl).toBeUndefined();
  });

  it.each(["casquette rouge", "https://www.amazon.fr/dp/B0C\n1234567", "https://www.amazon.fr/dp/B0C 1234567"])(
    "refuses an address with whitespace inside (%j)",
    (supplierUrl) => {
      expect(issuesOf({ ...BASE, supplierUrl })).toEqual([
        { path: "supplierUrl", message: "supplierUrl.whitespace" },
      ]);
    },
  );

  it("refuses control characters that the database could not store", () => {
    expect(issuesOf({ ...BASE, supplierUrl: `${PRODUCT_URL}&x=\u0000` })).toEqual([
      { path: "supplierUrl", message: expect.any(String) },
    ]);
  });
});

describe("analysisInputSchema category", () => {
  it.each([
    ["a", false],
    ["ab", true],
    ["x".repeat(60), true],
    ["x".repeat(61), false],
  ])("bounds the category to 2–60 characters (%j accepted: %s)", (category, accepted) => {
    const result = analysisInputSchema.safeParse({ ...BASE, category });
    if (accepted) expect(result).toMatchObject({ success: true, data: { category } });
    else expect(issuesOf({ ...BASE, category }).map((i) => i.path)).toEqual(["category"]);
  });
});

describe("analysisInputSchema economics", () => {
  it.each([
    ["supplierPrice", 0, false],
    ["supplierPrice", 0.01, true],
    ["supplierPrice", 100_000, true],
    ["supplierPrice", 100_000.01, false],
    ["supplierPrice", Number.NaN, false],
    ["shippingCost", -0.01, false],
    ["shippingCost", 0, true],
    ["shippingCost", 100_000, true],
    ["shippingCost", 100_000.01, false],
    ["targetMarginPct", 0.99, false],
    ["targetMarginPct", 1, true],
    ["targetMarginPct", 95, true],
    ["targetMarginPct", 95.01, false],
    ["sellingPrice", 0, false],
    ["sellingPrice", 100_000, true],
  ])("bounds %s (%d accepted: %s)", (field, value, accepted) => {
    const raw = { ...BASE, economics: { currency: "EUR", [field]: value } };
    const result = analysisInputSchema.safeParse(raw);
    if (accepted) expect(result).toMatchObject({ success: true, data: { economics: { [field]: value } } });
    else expect(issuesOf(raw).map((i) => i.path)).toEqual([`economics.${field}`]);
  });

  it.each([
    ["sellingPrice", Number.NaN, "sellingPrice.notNumber"],
    ["sellingPrice", 0, "sellingPrice.notPositive"],
    ["sellingPrice", 100_000.01, "sellingPrice.tooLarge"],
    ["landedCost", Number.NaN, "landedCost.notNumber"],
    ["landedCost", 0, "landedCost.notPositive"],
    ["landedCost", 100_000.01, "landedCost.tooLarge"],
  ])("gives a refused %s its message key (%d)", (field, value, message) => {
    expect(issuesOf({ ...BASE, economics: { currency: "EUR", [field]: value } })).toEqual([{ path: `economics.${field}`, message }]);
  });

  it("reads a pre-V1 landed cost as the supplier price with no separate shipping", () => {
    const result = analysisInputSchema.safeParse({ ...BASE, economics: { currency: "EUR", landedCost: 9 } });
    expect(result.success).toBe(true);
    expect(result.data?.economics).toEqual({ currency: "EUR", landedCost: 9, supplierPrice: 9, shippingCost: 0 });
  });

  it("refuses a shipping cost on top of a landed cost that already includes delivery", () => {
    expect(issuesOf({ ...BASE, economics: { currency: "EUR", landedCost: 10, shippingCost: 4 } })).toEqual([
      {
        path: "economics.landedCost",
        message: "landedCost.withShipping",
      },
    ]);
  });

  it("accepts a zero shipping cost next to a landed cost, since nothing is replaced", () => {
    const result = analysisInputSchema.safeParse({ ...BASE, economics: { currency: "EUR", landedCost: 10, shippingCost: 0 } });
    expect(result.data?.economics).toEqual({ currency: "EUR", landedCost: 10, supplierPrice: 10, shippingCost: 0 });
  });

  it("keeps the typed supplier price and shipping when a landed cost is also given", () => {
    const result = analysisInputSchema.safeParse({
      ...BASE,
      economics: { currency: "EUR", landedCost: 12, supplierPrice: 7, shippingCost: 3 },
    });
    expect(result.data?.economics).toEqual({ currency: "EUR", landedCost: 12, supplierPrice: 7, shippingCost: 3 });
  });
});

describe("analysisInputSchema data mode", () => {
  it("defaults to live data", () => {
    expect(analysisInputSchema.safeParse(BASE)).toMatchObject({ success: true, data: { dataMode: "live" } });
  });

  it("refuses mock data with its message key", () => {
    expect(issuesOf({ ...BASE, dataMode: "mock" })).toEqual([
      { path: "dataMode", message: "dataMode.mockRemoved" },
    ]);
  });
});
