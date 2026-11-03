import { describe, expect, it } from "vitest";
import { isAddressLike, readSupplierInput, resolveProductName, supplierChipLabel } from "./supplier-input";

const ALIEXPRESS = "https://fr.aliexpress.com/item/1005006123456789.html?spm=a2g0o";

describe("supplierChipLabel", () => {
  it("shortens a long product id", () => {
    expect(supplierChipLabel("aliexpress", "1005006123456789", "fr")).toBe("AliExpress, article 1005006…");
  });

  it("keeps a short id whole", () => {
    expect(supplierChipLabel("1688", "61234567", "fr")).toBe("1688, article 61234567");
  });
});

describe("localized labels", () => {
  it("follows the interface language", () => {
    expect(supplierChipLabel("aliexpress", "1005006123456789", "en")).toBe("AliExpress, item 1005006…");
    expect(readSupplierInput("https://www.temu.com/fr", "en")).toEqual({
      kind: "guidance",
      message: "This Temu link doesn't lead to a product page: paste the address of the product page.",
    });
  });
});

describe("readSupplierInput", () => {
  it("reads blank text as empty and prose as a name", () => {
    expect(readSupplierInput("   ", "fr")).toEqual({ kind: "empty" });
    expect(readSupplierInput("chaussettes chauffantes", "fr")).toEqual({ kind: "name" });
  });

  it("recognises a product page offline", () => {
    expect(readSupplierInput(ALIEXPRESS, "fr")).toEqual({
      kind: "product",
      productId: "1005006123456789",
      chipLabel: "AliExpress, article 1005006…",
    });
  });

  it("gives the French guidance for a short link", () => {
    const input = readSupplierInput("https://s.click.aliexpress.com/e/_abc", "fr");
    expect(input).toEqual({ kind: "guidance", message: "Lien court : ouvre-le et colle l'adresse finale de la fiche produit." });
  });

  it("gives the parser message for a supplier page that is not a product", () => {
    expect(readSupplierInput("https://www.temu.com/fr", "fr").kind).toBe("guidance");
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
  it("keeps only what the owner typed", () => {
    expect(resolveProductName("  Lampe lune ")).toBe("Lampe lune");
  });

  it("never invents a name from a link: the form asks for one", () => {
    expect(resolveProductName("")).toBe("");
    expect(resolveProductName("   ")).toBe("");
  });
});
