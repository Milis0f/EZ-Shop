import { describe, expect, it } from "vitest";
import { defaultProductName, isAddressLike, readSupplierInput, resolveProductName, supplierChipLabel } from "./supplier-input";

const ALIEXPRESS = "https://fr.aliexpress.com/item/1005006123456789.html?spm=a2g0o";

describe("supplierChipLabel", () => {
  it("shortens a long product id", () => {
    expect(supplierChipLabel("aliexpress", "1005006123456789")).toBe("AliExpress, article 1005006…");
  });

  it("keeps a short id whole", () => {
    expect(supplierChipLabel("1688", "61234567")).toBe("1688, article 61234567");
  });
});

describe("defaultProductName", () => {
  it("names the product after its platform and full id", () => {
    expect(defaultProductName("temu", "601099512345678")).toBe("Produit Temu 601099512345678");
  });
});

describe("readSupplierInput", () => {
  it("reads blank text as empty and prose as a name", () => {
    expect(readSupplierInput("   ")).toEqual({ kind: "empty" });
    expect(readSupplierInput("chaussettes chauffantes")).toEqual({ kind: "name" });
  });

  it("recognises a product page offline", () => {
    expect(readSupplierInput(ALIEXPRESS)).toEqual({
      kind: "product",
      productId: "1005006123456789",
      chipLabel: "AliExpress, article 1005006…",
      defaultName: "Produit AliExpress 1005006123456789",
    });
  });

  it("gives the French guidance for a short link", () => {
    const input = readSupplierInput("https://s.click.aliexpress.com/e/_abc");
    expect(input).toEqual({ kind: "guidance", message: "Lien court : ouvre-le et colle l'adresse finale de la fiche produit." });
  });

  it("gives the parser message for a supplier page that is not a product", () => {
    expect(readSupplierInput("https://www.temu.com/fr").kind).toBe("guidance");
  });
});

describe("isAddressLike", () => {
  it("tells addresses from names", () => {
    expect(isAddressLike("https://example.com/p/1")).toBe(true);
    expect(isAddressLike("shop.example.com/p/1")).toBe(true);
    expect(isAddressLike("lampe v2.0")).toBe(false);
    expect(isAddressLike("Pack : 3 paires")).toBe(false);
    expect(isAddressLike("")).toBe(false);
  });
});

describe("resolveProductName", () => {
  const product = readSupplierInput(ALIEXPRESS);

  it("prefers the name the owner typed", () => {
    expect(resolveProductName("  Lampe lune ", product)).toBe("Lampe lune");
  });

  it("falls back to the default name of a recognised page", () => {
    expect(resolveProductName("", product)).toBe("Produit AliExpress 1005006123456789");
  });

  it("leaves the name empty otherwise, so the form asks for it", () => {
    expect(resolveProductName("", readSupplierInput("https://s.click.aliexpress.com/e/_abc"))).toBe("");
  });
});
