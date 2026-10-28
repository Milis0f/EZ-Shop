import { describe, expect, it } from "vitest";
import { buildAssumptions } from "@/config/assumptions";
import type { CountryAnalysis, UnitEconomics } from "@/domain/analysis";
import { insufficient, isKnown, observed } from "@/domain/datum";
import type { Decision } from "@/domain/scoring";
import { analyzeCountry, type CountrySignals } from "@/engine/analyze-country";
import { TEST_NOW, testSource } from "@/test/fixtures";
import { verdictFor } from "./verdict";

const none = (p: string) => insufficient(`${p} indisponible`, [p]);

function country(opts: { economics?: UnitEconomics; withDemand?: boolean } = {}): CountryAnalysis {
  const { economics = { currency: "EUR" }, withDemand = true } = opts;
  const signals: CountrySignals = {
    country: "FR",
    terms: [{ term: "chaussettes chauffantes", language: "fr", kind: "input", source: "user" }],
    languageMismatch: false,
    keywordMetrics: none("google-ads-keyword-planner"),
    searchInterest: none("google-trends"),
    adActivity: { meta: none("meta-ad-library"), tiktok: none("tiktok-commercial-content") },
    adCosts: { meta: none("meta-marketing-api"), tiktok: none("tiktok-business-api") },
    macro: {},
    language: "fr",
    v2: {
      suggestions: withDemand
        ? observed({ suggestions: ["chaussettes chauffantes avis"], source: testSource("google-autocomplete") }, "count", [testSource("google-autocomplete")])
        : none("google-autocomplete"),
      content: none("youtube-data"),
      listings: none("ebay-browse"),
      topicInterest: none("wikimedia"),
      duties: none("uk-trade-tariff"),
      vat: observed({ country: "FR" as const, standardRatePct: 20, source: testSource("vat-rates") }, "percent", [testSource("vat-rates")]),
    },
    issues: [],
  };
  return analyzeCountry(signals, { assumptions: buildAssumptions(), economics, now: TEST_NOW, seed: "t", qualityOf: () => 0.4 });
}

const withDecision = (c: CountryAnalysis, decision: Decision): CountryAnalysis => ({ ...c, scoring: { ...c.scoring, decision } });

describe("verdict_v1 — decision table", () => {
  const base = country();

  it("prioritize gives OUI", () => {
    const v = verdictFor(withDecision(base, "prioritize"));
    expect(v).toMatchObject({ value: "oui", label: "OUI", method: "verdict_v1", blocking: [] });
  });

  it("avoid gives NON", () => {
    expect(verdictFor(withDecision(base, "avoid"))).toMatchObject({ value: "non", label: "NON", blocking: [] });
  });

  it("test_carefully gives À SURVEILLER with mixed signals", () => {
    const v = verdictFor(withDecision(base, "test_carefully"));
    expect(v).toMatchObject({ value: "surveiller", label: "À SURVEILLER" });
    expect(v.reason).toMatch(/signaux mitigés/i);
  });

  it("exploratory_only gives À SURVEILLER with too low a confidence", () => {
    const v = verdictFor(withDecision(base, "exploratory_only"));
    expect(v.value).toBe("surveiller");
    expect(v.reason).toMatch(/confiance trop faible/i);
  });

  it("insufficient_data gives À SURVEILLER with insufficient data", () => {
    const v = verdictFor(withDecision(base, "insufficient_data"));
    expect(v.value).toBe("surveiller");
    expect(v.reason).toMatch(/données insuffisantes/i);
  });

  it("a known blocking factor gives NON whatever the decision", () => {
    const loss = country({ economics: { currency: "EUR", sellingPrice: 12, supplierPrice: 8, shippingCost: 3 } });
    expect(verdictFor(withDecision(loss, "test_carefully"))).toMatchObject({ value: "non", label: "NON" });
  });
});

describe("verdict_v1 — blocking factors", () => {
  it("a name-only product is À SURVEILLER for insufficient data, with no blocking factor", () => {
    const v = verdictFor(country());
    expect(v).toMatchObject({ value: "surveiller", blocking: [] });
    expect(v.reason).toMatch(/données insuffisantes/i);
  });

  it("a loss at the planned price gives NON, even with a high score", () => {
    const loss = withDecision(country({ economics: { currency: "EUR", sellingPrice: 12, supplierPrice: 8, shippingCost: 3 } }), "prioritize");
    const v = verdictFor(loss);
    expect(v.value).toBe("non");
    expect(v.blocking.map((b) => b.id)).toContain("loss_at_planned_price");
    expect(v.reason).toBe(v.blocking[0]!.message);
  });

  it("the loss message names duties only when the landed cost holds them", () => {
    const loss = country({ economics: { currency: "EUR", sellingPrice: 12, supplierPrice: 8, shippingCost: 3 } });
    const signals = loss.signals!;
    const noDuty = { ...loss, signals: { ...signals, taxes: insufficient("Droits non calculables", ["uk-trade-tariff"]) } };
    expect(verdictFor(noDuty).blocking[0]!.message).toMatch(/livraison comprise, droits non inclus\.$/);
    const taxes = observed({ ...(isKnown(signals.taxes) ? signals.taxes.value : ({} as never)), dutyPerUnitEur: 1 }, "money", [testSource("uk-trade-tariff")]);
    const withDuty = { ...loss, signals: { ...signals, taxes } };
    expect(verdictFor(withDuty).blocking[0]!.message).toMatch(/après droits et livraison\.$/);
  });

  it("a planned price below the target gives NON with the minimum price in the message", () => {
    // Landed 11 €, planned 30 € incl. 20 % VAT = 25 € excl. VAT (56 %), target 60 % → minimum 27,50 € excl. VAT, 33,00 € incl. VAT.
    const c = country({ economics: { currency: "EUR", sellingPrice: 30, supplierPrice: 8, shippingCost: 3, targetMarginPct: 60 } });
    const v = verdictFor(withDecision(c, "prioritize"));
    expect(v.value).toBe("non");
    expect(v.blocking).toEqual([
      {
        id: "below_target_margin",
        cause: { code: "below_target_margin", targetMarginPct: 60, exVatEur: 27.5, inclVatEur: 33 },
        message: expect.stringMatching(/33,00\s€/),
      },
    ]);
    expect(v.blocking[0]!.message).toMatch(/27,50\s€/);
  });

  it("a planned price that reaches the target is not blocking", () => {
    const c = country({ economics: { currency: "EUR", sellingPrice: 30, supplierPrice: 8, shippingCost: 3, targetMarginPct: 40 } });
    expect(verdictFor(withDecision(c, "prioritize"))).toMatchObject({ value: "oui", blocking: [] });
  });

  it("no national demand data at all gives NON", () => {
    const v = verdictFor(country({ withDemand: false }));
    expect(v.value).toBe("non");
    expect(v.blocking.map((b) => b.id)).toEqual(["no_demand_data"]);
  });
});
