import { describe, expect, it } from "vitest";
import { analysisInputSchema } from "./schemas";

const parse = (productName: string) => analysisInputSchema.safeParse({ productName, countries: ["FR"] });

describe("analysisInputSchema user text", () => {
  it("rejects NUL in a product name with a French validation message", () => {
    const result = parse("Lampe\u0000LED");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["productName"],
        message: "Le nom du produit contient des caractères non autorisés.",
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
          message: "Le nom du produit contient des caractères non autorisés.",
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
        message: "Le nom du produit contient des caractères non autorisés.",
      });
    }
  });

  it("rejects a lone low surrogate in a product name", () => {
    const result = parse("Lampe \udc00");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["productName"],
        message: "Le nom du produit contient des caractères non autorisés.",
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
        message: "Ce terme contient des caractères non autorisés.",
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
          message: "Le nom du produit contient des caractères non autorisés.",
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

/** Issues as the pipeline reports them: dotted path and message. */
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

  it("refuses a short link with the French guidance", () => {
    expect(issuesOf({ ...BASE, supplierUrl: "https://s.click.aliexpress.com/e/_DmXyZ12" })).toEqual([
      { path: "supplierUrl", message: "Lien court : ouvre-le et colle l'adresse finale de la fiche produit." },
    ]);
  });

  it("refuses a non-web address with the parser's message", () => {
    expect(issuesOf({ ...BASE, supplierUrl: "javascript:alert(1)" })).toEqual([
      { path: "supplierUrl", message: "Adresse refusée : seules les adresses web en http ou https sont acceptées." },
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
        { path: "supplierUrl", message: "Adresse invalide : colle l'adresse complète de la fiche produit, sans espace." },
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
    ["sellingPrice", Number.NaN, "Prix de vente : saisis un nombre."],
    ["sellingPrice", 0, "Prix de vente : indique un montant supérieur à 0 €."],
    ["sellingPrice", 100_000.01, "Prix de vente : 100 000 € au plus."],
    ["landedCost", Number.NaN, "Coût de revient : saisis un nombre."],
    ["landedCost", 0, "Coût de revient : indique un montant supérieur à 0 €."],
    ["landedCost", 100_000.01, "Coût de revient : 100 000 € au plus."],
  ])("explains a refused %s in French (%d)", (field, value, message) => {
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
        message: "Coût de revient : il inclut déjà la livraison. Indique plutôt le prix fournisseur et les frais de livraison.",
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

  it("refuses mock data with the French message", () => {
    expect(issuesOf({ ...BASE, dataMode: "mock" })).toEqual([
      { path: "dataMode", message: "Les données fictives ont été retirées de l'application." },
    ]);
  });
});
