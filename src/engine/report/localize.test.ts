import { describe, expect, it } from "vitest";
import { LOCALES } from "@/i18n/config";
import { countryName, criterionLabel, interestLabel, monthList, reasonText, sourceName, verdictWord } from "./localize";
import type { Reason } from "./verdict";

const ALL: readonly Reason[] = [
  { code: "loss_at_planned_price", marginPct: -12.4, dutyIncluded: true },
  { code: "below_target_margin", targetMarginPct: 60, exVatEur: 27.5, inclVatEur: 33 },
  { code: "no_demand_data" },
  { code: "interest_trend", direction: "rising", annualGrowthPct: 12.3, fromWikipedia: true },
  { code: "seasonal_peak", months: [11, 12] },
  { code: "steady_demand" },
  { code: "no_related_searches" },
  { code: "buying_searches", count: 1, total: 8 },
  { code: "marketplace_searches", count: 2, first: "amazon" },
  { code: "margin_at_price", marginPct: 41.6 },
  { code: "strongest_signals", criteria: [{ id: "demand_trend", label: "Tendance historique" }] },
  { code: "above_thresholds" },
  { code: "weakest_criteria", criteria: [{ id: "ad_cost", label: "Coût publicitaire" }] },
  { code: "below_threshold" },
  { code: "mixed_signals", best: { id: "demand_trend", label: "Tendance historique" }, worst: { id: "ad_cost", label: "Coût publicitaire" } },
  { code: "low_confidence", factor: { id: "coverage", label: "Couverture" } },
  { code: "insufficient_data", sources: ["google-ads-keyword-planner", "world-bank"] },
];

describe("reason texts", () => {
  it("keeps the French text printed before i18n", () => {
    expect(reasonText(ALL[0]!, "fr")).toBe("Perte à ton prix : marge de -12 % après droits et livraison.");
    expect(reasonText(ALL[1]!, "fr")).toMatch(/^Prix sous le minimum pour ta marge de 60 % : vends au moins 33,00\s€ TTC, soit 27,50\s€ HT\.$/);
    expect(reasonText(ALL[3]!, "fr")).toBe("Intérêt en hausse (+12 % par an, d'après Wikipédia).");
    expect(reasonText(ALL[4]!, "fr")).toBe("Pic en nov., déc.");
    expect(reasonText(ALL[7]!, "fr")).toBe("1 recherche d'achat (prix, avis…) parmi 8.");
    expect(reasonText(ALL[14]!, "fr")).toBe("Signaux mitigés : point fort tendance historique, point faible coût publicitaire.");
    expect(reasonText(ALL[16]!, "fr")).toBe("Données insuffisantes : sources à connecter, Google Ads Keyword Planner, Banque mondiale.");
  });

  it("renders every code in English and Spanish, with locale number formats", () => {
    expect(reasonText(ALL[0]!, "en")).toBe("Loss at your price: -12% margin after duties and shipping.");
    expect(reasonText(ALL[1]!, "en")).toBe("Price below the minimum for your 60% margin: sell for at least €33.00 incl. VAT, i.e. €27.50 excl. VAT.");
    expect(reasonText(ALL[4]!, "en")).toBe("Peak in Nov, Dec.");
    expect(reasonText(ALL[14]!, "es")).toBe("Señales mixtas: punto fuerte tendencia histórica, punto débil coste publicitario.");
    expect(reasonText(ALL[16]!, "es")).toBe("Datos insuficientes: fuentes por conectar, Google Ads Keyword Planner, Banco Mundial.");
    for (const locale of LOCALES) {
      for (const reason of ALL) {
        const text = reasonText(reason, locale);
        expect(text, `${reason.code} in ${locale}`).not.toMatch(/\{\w+\}/);
        expect(text.endsWith(".")).toBe(true);
      }
    }
  });

  it("names verdicts, months, countries, sources and criteria in the locale", () => {
    expect(LOCALES.map((l) => verdictWord("surveiller", l))).toEqual(["WATCH", "À SURVEILLER", "VIGILAR"]);
    expect(monthList([1, 9], "es")).toBe("ene, sept");
    expect(countryName("DE", "en")).toBe("Germany");
    expect(countryName("DE", "es")).toBe("Alemania");
    expect(countryName("DE", "fr")).toBe("Allemagne");
    expect(sourceName("oecd", "en")).toBe("OECD");
    expect(sourceName("unknown-source", "en")).toBe("unknown-source");
    expect(criterionLabel({ id: "not_in_dictionary", label: "Libellé moteur" }, "en")).toBe("Libellé moteur");
    expect(interestLabel({ value: 1, label: "", direct: false, article: "Sock" }, "en")).toBe("monthly readers of the Wikipedia article “Sock”");
    expect(interestLabel({ value: 1, label: "", direct: false, article: null }, "fr")).toBe("lecteurs par mois de l'article Wikipédia « la catégorie »");
  });
});
