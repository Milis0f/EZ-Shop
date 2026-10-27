import { beforeAll, describe, expect, it } from "vitest";
import type { AnalysisResult, CountryAnalysis } from "@/domain/analysis";
import { estimate, insufficient, isKnown, observed } from "@/domain/datum";
import type { TrendStats } from "@/domain/market";
import { testSource } from "@/test/fixtures";
import { buildFactSheet } from "./fact-sheet";
import { findUnsupportedNumbers } from "./number-guard";
import { mockStoredAnalysis } from "@/test/stored-analysis";

/** A complete analysis from the offline mock providers (development fixtures, not market data). */
const mockAnalysis = (): Promise<AnalysisResult> => mockStoredAnalysis(["FR", "DE", "US"], { currency: "EUR", sellingPrice: 29, landedCost: 9 });

const SECRET = "AIzaSyD-0123456789abcdefghijklmnopqrstuv";
const trend: TrendStats = { annualGrowthPct: -12.24, direction: "declining", r2: 0.8, monthsUsed: 36 };

/** The mock analysis turned into a live one, with hand-set values on France. */
function liveVariant(base: AnalysisResult): AnalysisResult {
  const [fr, ...rest] = base.countries;
  const searches = observed(1234.4, "searches_per_month", [testSource("google-ads-keyword-planner")]);
  const france: CountryAnalysis = {
    ...fr,
    demand: {
      ...fr.demand,
      avgMonthlySearches: searches,
      trend: estimate(trend, "percent", { method: "test", inputs: [{ ...searches, sources: [{ ...testSource("google-trends"), origin: "mock" }] }] }),
      futureGrowthPct: insufficient(`Échec : https://api.example.com/v1?key=${SECRET} a répondu 401`, ["google-trends"]),
    },
    scoring: { ...fr.scoring, confidence: { ...fr.scoring.confidence, mockTainted: true } },
  };
  return { ...base, dataMode: "live", countries: [france, ...rest] };
}

let mock: AnalysisResult;
beforeAll(async () => {
  mock = await mockAnalysis();
});

describe("buildFactSheet", () => {
  it("names the product, the analysed countries, the user's prices and the mock mode", () => {
    const { text } = buildFactSheet(mock);

    expect(text).toContain("Produit : « Chaussettes chauffantes »");
    expect(text).toContain("Pays analysés (3) : France (FR), Allemagne (DE), États-Unis (US)");
    expect(text).toContain("Prix de vente : 29 € [hypothèse ; saisie utilisateur]");
    expect(text).toContain("Mode de données : fictif (mock de développement)");
    expect(text).toMatch(/## France \(FR\)\n- Décision actuelle : /);
  });

  it("writes each known value with its kind and source, and collects its number", () => {
    const fr = mock.countries[0];
    const { text, numbers } = buildFactSheet(mock);
    const confidence = Math.round(fr.scoring.confidence.score);

    expect(text).toContain(`- Confiance : ${confidence} sur 100`);
    expect(numbers.has(String(confidence))).toBe(true);
    if (isKnown(fr.demand.avgMonthlySearches)) {
      expect(text).toMatch(/- Recherches Google par mois \(moyenne\) : [\d ]+ \[observé ; Google Ads\]/);
    }
    expect(text).toMatch(/- Tendance : en (hausse|baisse)|- Tendance : stable/);
  });

  it("lists DATA_INSUFFICIENT items with their reason and what is missing, once when every country shares them", () => {
    const { text } = buildFactSheet(mock);

    expect(text).toContain("- Prix fournisseur AliExpress : ");
    expect(text).toContain("Données insuffisantes dans tous les pays (DATA_INSUFFICIENT) :");
    expect(text.match(/Audience Wikipédia : /g)).toHaveLength(1);
    expect(text).toMatch(/\(manque : [^)]*Wikipédia/);
  });

  it("formats numbers the French way and lets the guard accept them in any spacing", () => {
    const { text, numbers } = buildFactSheet(liveVariant(mock));

    expect(text).toContain("- Recherches Google par mois (moyenne) : 1 234 [observé ; Google Ads]");
    expect(text).toContain("- Tendance : en baisse, -12,2 % par an (calculée sur 36 mois) [estimation ; Google Trends (fictif)]");
    expect(text).not.toMatch(/[  ]/);
    expect(findUnsupportedNumbers("1234 recherches, 1 234 aussi, −12,2 % par an sur 36 mois", numbers)).toEqual([]);
    expect(findUnsupportedNumbers("+12,2 % par an", numbers)).toEqual(["+12,2"]);
  });

  it("allows only the numbers of values, never those of labels, scales or the date", () => {
    const { text, numbers } = buildFactSheet(liveVariant(mock));

    expect(text).toContain("(P10, P50, P90)");
    expect(text).toContain(" sur 100");
    expect(text).not.toMatch(/Analyse du /);
    expect(text).not.toMatch(/[\u0002\u0003]/);
    for (const invented of [
      "La demande devrait progresser de 12 % sur les 24 prochains mois.",
      "Le prix de vente conseillé est de 29 € pour une marge de 100 %.",
      "Le marché devrait doubler d'ici 2026.",
      "Le P90 atteint 90 %.",
    ]) {
      expect(findUnsupportedNumbers(invented, numbers), invented).not.toEqual([]);
    }
    expect(numbers.has("1234")).toBe(true);
    expect(numbers.has("-12.2")).toBe(true);
    expect(numbers.has("36")).toBe(true);
  });

  it("flags mock values in a live analysis", () => {
    const { text } = buildFactSheet(liveVariant(mock));

    expect(text).toContain("Mode de données : réel (sources externes).");
    expect(text).toContain("Attention : des valeurs de ce pays viennent de données fictives (mock)");
  });

  it("never carries a URL, a key-like token, an internal id or a raw stack", () => {
    const analysis = { ...liveVariant(mock), error: "TypeError: boom at fetch (node:internal)" };
    const { text } = buildFactSheet(analysis);

    expect(text).not.toContain(SECRET);
    expect(text).not.toMatch(/https?:/);
    expect(text).not.toContain(analysis.id);
    expect(text).not.toContain("TypeError");
    expect(text).toContain("Échec : [lien retiré] a répondu 401 (manque : Google Trends)");
  });

  it("leaves out the description of a searched customs code, keeps the one of a typed code", () => {
    // Real case: "casquette" was translated to "cap" and the tariff search matched bottle caps.
    const description = "Articles for the conveyance or packing of goods, of plastics › Caps and capsules for bottles (trouvé pour « cap »)";
    const hs = (method: "search" | "user") =>
      observed({ code: "3923501000", hs6: "392350", description, method }, "none", [testSource("uk-trade-tariff")]);

    const searched = buildFactSheet({ ...liveVariant(mock), classification: hs("search") }).text;
    expect(searched).toContain("- Code douanier : 3923501000, proposé automatiquement par la recherche du tarif, à vérifier");
    expect(searched).not.toContain("plastics");

    const typed = buildFactSheet({ ...liveVariant(mock), classification: hs("user") }).text;
    expect(typed).toContain("- Code douanier : 3923501000 (Articles for the conveyance or packing of goods, of plastics");
  });

  it("writes countries with word-for-word the same facts once when asked, in the analysis order", () => {
    const [fr, , us] = mock.countries;
    const twins: AnalysisResult = { ...mock, countries: [fr, { ...fr, country: "DE" }, us] };

    const apart = buildFactSheet(twins).text;
    const grouped = buildFactSheet(twins, { groupSameCountries: true });

    expect(apart).toContain("## France (FR)\n");
    expect(apart).toContain("## Allemagne (DE)\n");
    expect(grouped.text).toContain("Pays analysés (3) : France (FR), Allemagne (DE), États-Unis (US)");
    expect(grouped.text).toMatch(/## France \(FR\), Allemagne \(DE\) : mêmes faits pour chacun de ces pays\n- Décision actuelle : /);
    expect(grouped.text.indexOf("Allemagne (DE) : mêmes faits")).toBeLessThan(grouped.text.indexOf("## États-Unis (US)"));
    expect(grouped.text).not.toContain("## Allemagne (DE)");
    expect(grouped.text.length).toBeLessThan(apart.length);
    expect(grouped.numbers).toEqual(buildFactSheet(twins).numbers);
  });

  it("leaves out advertising, revenue and assumptions in the brief version", () => {
    const full = buildFactSheet(mock).text;
    const brief = buildFactSheet(mock, { brief: true }).text;

    expect(full).toContain("Hypothèses de calcul :");
    expect(brief).not.toContain("Hypothèses de calcul :");
    expect(brief).not.toContain("Budget de test");
    expect(brief).not.toContain("Chiffre d'affaires potentiel");
    expect(brief.length).toBeLessThan(full.length);
    expect(brief).toContain("- Décision actuelle : ");
  });
});
