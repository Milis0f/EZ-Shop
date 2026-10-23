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
