import { describe, expect, it } from "vitest";
import { DEFAULT_CRITERIA, LICENCE_PENDING } from "@/engine/scoring/criteria";
import { engineText } from "./engine-text";

const FRENCH = /[éèàùçêôîœ]|\b(des|les|une|pour|pays|données|indisponible|non|aucun|saisis)\b/i;

describe("engineText", () => {
  it("returns French unchanged", () => {
    expect(engineText("Tendance indisponible.", "fr")).toBe("Tendance indisponible.");
  });

  it("translates fixed engine sentences", () => {
    expect(engineText(LICENCE_PENDING, "en")).toBe("Derived statistic switched off until the licence is checked.");
    expect(engineText("Prix de vente envisagé non renseigné.", "es")).toBe("Precio de venta previsto no indicado.");
  });

  it("translates the margin panel sentences", () => {
    expect(engineText("Prix fournisseur et livraison saisis par toi, droits non inclus (non calculables pour ce pays).", "en")).toBe(
      "Supplier price and shipping as you entered them, duties not included (they can't be calculated for this country).",
    );
    expect(engineText("Prix de vente envisagé non renseigné.", "en")).toBe("Planned selling price not provided.");
    expect(engineText("Marge visée non renseignée.", "en")).toBe("Target margin not provided.");
    for (const text of [
      "Prix fournisseur et livraison saisis par toi, droits non inclus (non calculables pour ce pays).",
      "Prix de vente envisagé non renseigné.",
      "Marge visée non renseignée.",
    ]) {
      expect(engineText(text, "es")).not.toBe(text);
    }
  });

  it("translates wordings of earlier engine versions", () => {
    expect(engineText("Prix de vente HT et coût de revient requis.", "en")).toBe("Selling price and landed cost required.");
    expect(engineText("MyMemory: traduction vide", "en")).toBe("MyMemory: empty translation");
    expect(engineText("MyMemory : traduction vide", "en")).toBe("MyMemory: empty translation");
    expect(engineText("Donnée rapide la plus récente : 1 jour.", "en")).toBe("Most recent fast-moving data: 1 day old.");
  });

  it("names connectors in the locale", () => {
    expect(engineText("Meta Marketing API — delivery estimate : connecteur non implémenté.", "es")).toBe(
      "Meta Marketing API — estimaciones de difusión: conector aún no implementado.",
    );
    expect(engineText("TikTok API for Business — estimations : connecteur non implémenté.", "en")).toBe(
      "TikTok API for Business — estimates: connector not implemented yet.",
    );
  });

  it("re-renders numbers, months, money and countries in the locale", () => {
    expect(engineText("-12,2 %/an", "en")).toBe("-12.2% a year");
    expect(engineText("+3,5 %/mois de nouvelles annonces", "es")).toBe("+3,5 % al mes de anuncios nuevos");
    expect(engineText("12 300 recherches/mois", "en")).toBe("12,300 searches a month");
    expect(engineText("Pic en mai (dans 7 mois)", "en")).toBe("Peak in May (in 7 months)");
    expect(engineText("Pic en déc. (dans 1 mois)", "en")).toBe("Peak in December (in 1 month)");
    expect(engineText("Couverture des données 36 % < 50 % requis.", "en")).toBe("Data coverage 36% < 50% required.");
    expect(engineText("Donnée rapide la plus récente : 1 jours.", "en")).toBe("Most recent fast-moving data: 1 day old.");
    expect(engineText("Prix fournisseur et livraison saisis par toi, plus 1.5 € de droits de douane par unité.", "en")).toBe(
      "Supplier price and shipping as you entered them, plus €1.50 of customs duty per unit.",
    );
    expect(engineText("Google Trends non configuré (Allemagne).", "en")).toBe("Google Trends is not configured (Germany).");
    expect(engineText("Origine Chine : marché unique, aucun droit de douane.", "es")).toMatch(/^Origen China: mercado único/);
  });

  it("translates nested reasons and multi-sentence explanations", () => {
    expect(engineText("Droits de douane non calculés : code douanier (SH) ou tarif indisponible.", "en")).toBe(
      "Customs duties not calculated: customs code (HS) or tariff unavailable.",
    );
    expect(
      engineText("Croissance annuelle : −30 % → 0, +50 % → 1. Calculé sur l'audience Wikipédia de la catégorie, faute de données de recherche.", "en"),
    ).toBe("Annual growth: −30% → 0, +50% → 1. Calculated on the category's Wikipedia audience, as there is no search data.");
  });

  it("keeps unknown text as stored instead of guessing", () => {
    expect(engineText("Something else entirely", "en")).toBe("Something else entirely");
  });

  it("covers every criterion explanation the engine can write when data is missing", () => {
    const ctx = { demand: {}, competition: {}, advertising: [], market: {}, economics: {}, signals: undefined } as never;
    for (const criterion of DEFAULT_CRITERIA) {
      let explanation: string;
      try {
        explanation = criterion.evaluate(ctx).explanation;
      } catch {
        continue;
      }
      for (const locale of ["en", "es"] as const) expect(engineText(explanation, locale), `${criterion.id} ${locale}`).not.toMatch(FRENCH);
    }
  });
});
