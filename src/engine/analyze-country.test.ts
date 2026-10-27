import { describe, expect, it } from "vitest";
import { buildAssumptions } from "@/config/assumptions";
import { CRITERION_WEIGHTS, SCORING_MODEL_VERSION } from "@/config/scoring";
import { DATA_INSUFFICIENT, insufficient, isKnown, observed } from "@/domain/datum";
import { kpDatum, syntheticSeries, TEST_NOW, testSource, trendsDatum } from "@/test/fixtures";
import { analyzeCountry, type CountrySignals } from "./analyze-country";
import { decide } from "./scoring/confidence";

const none = (provider: string) => insufficient(`${provider} indisponible`, [provider]);
const quality = (id: string) => ({ "google-ads-keyword-planner": 1, "google-trends": 0.85, "world-bank": 0.95 })[id];

function signals(overrides: Partial<CountrySignals> = {}): CountrySignals {
  return {
    country: "FR",
    terms: [{ term: "chaussettes", language: "fr", kind: "input", source: "user" }],
    languageMismatch: false,
    keywordMetrics: none("google-ads-keyword-planner"),
    searchInterest: none("google-trends"),
    adActivity: { meta: none("meta-ad-library"), tiktok: none("tiktok-commercial-content") },
    adCosts: { meta: none("meta-marketing-api"), tiktok: none("tiktok-business-api") },
    macro: {},
    language: "fr",
    v2: {
      suggestions: none("google-autocomplete"),
      content: none("youtube-data"),
      listings: none("ebay-browse"),
      topicInterest: none("wikimedia"),
      duties: none("uk-trade-tariff"),
      vat: none("vat-rates"),
    },
    issues: [],
    ...overrides,
  };
}

const options = (sellingPrice?: number, landedCost?: number) => ({
  assumptions: buildAssumptions(),
  economics: { currency: "EUR" as const, sellingPrice, landedCost },
  now: TEST_NOW,
  seed: "test",
  qualityOf: quality,
});

const series = syntheticSeries({ months: 48, base: 8_000, annualGrowth: 0.12, amplitude: 0.3, peakMonth: 12 });

describe("scoring configuration", () => {
  it("weights sum to 100", () => {
    expect(Object.values(CRITERION_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("analyzeCountry — honesty rules", () => {
  it("produces no score and no sales when only macro data exists", () => {
    const gdp = observed(60_000, "money_per_capita_ppp", [testSource("world-bank", "2025")]);
    const result = analyzeCountry(signals({ macro: { gdp_per_capita_ppp: gdp } }), options(25, 8));
    expect(result.scoring.score.status).toBe(DATA_INSUFFICIENT);
    expect(result.scoring.decision).toBe("insufficient_data");
    expect(result.sales.annualOrders.status).toBe(DATA_INSUFFICIENT);
    expect(result.advertising.every((c) => c.cpc.status === DATA_INSUFFICIENT)).toBe(true);
    expect(result.dataGaps).toContain("google-ads-keyword-planner");
  });

  it("refuses sales estimates from a relative Trends index", () => {
    const result = analyzeCountry(signals({ searchInterest: trendsDatum(series) }), options(25, 8));
    expect(isKnown(result.demand.trend)).toBe(true);
    expect(result.sales.annualOrders.status).toBe(DATA_INSUFFICIENT);
    expect(!isKnown(result.sales.annualOrders) && result.sales.annualOrders.reason).toMatch(/indice relatif/);
  });

  it("estimates sales, costs and a score with Keyword Planner data", () => {
    const result = analyzeCountry(signals({ keywordMetrics: kpDatum(series), searchInterest: trendsDatum(series) }), options(30, 10));
    const { sales, scoring, advertising } = result;
    expect(isKnown(sales.annualOrders) && sales.annualOrders.kind).toBe("estimate");
    if (isKnown(sales.annualOrders)) {
      expect(sales.annualOrders.value.p10).toBeLessThan(sales.annualOrders.value.p50);
      expect(sales.annualOrders.value.p50).toBeLessThan(sales.annualOrders.value.p90);
      expect(sales.annualOrders.assumptionKeys).toEqual(expect.arrayContaining(["traffic_capture_share", "conversion_rate"]));
    }
    expect(isKnown(sales.annualRevenue)).toBe(true);
    expect(isKnown(advertising.find((c) => c.platform === "google")!.cpa)).toBe(true);
    expect(advertising.find((c) => c.platform === "meta")!.cpc.status).toBe(DATA_INSUFFICIENT);
    expect(isKnown(scoring.score)).toBe(true);
    if (isKnown(scoring.score)) {
      expect(scoring.score.value.total).toBeGreaterThanOrEqual(0);
      expect(scoring.score.value.total).toBeLessThanOrEqual(100);
    }
    expect(scoring.confidence.factors.find((f) => f.id === "consistency")!.value).toBeGreaterThan(0.9);
    expect(scoring.confidence.mockTainted).toBe(false);
  });

  it("is reproducible for the same seed", () => {
    const run = () => analyzeCountry(signals({ keywordMetrics: kpDatum(series) }), options(30, 10));
    expect(run().sales).toEqual(run().sales);
  });

  it("marks revenue insufficient without a selling price", () => {
    const result = analyzeCountry(signals({ keywordMetrics: kpDatum(series) }), options());
    expect(result.sales.annualRevenue.status).toBe(DATA_INSUFFICIENT);
    expect(result.scoring.criteria.find((c) => c.id === "unit_economics")!.status).toBe(DATA_INSUFFICIENT);
  });

  it("caps the score when the CPA exceeds the unit margin", () => {
    const expensive = kpDatum(series, { lowTopOfPageBid: 4, highTopOfPageBid: 9 });
    const vat = observed({ country: "FR" as const, standardRatePct: 20, source: testSource("vat-rates") }, "percent", [testSource("vat-rates")]);
    const base = signals();
    // 12 € incl. VAT → 10 € excl. VAT: no margin left over the 10 € cost.
    const result = analyzeCountry(signals({ keywordMetrics: expensive, v2: { ...base.v2, vat } }), options(12, 10));
    expect(isKnown(result.scoring.score)).toBe(true);
    if (isKnown(result.scoring.score)) expect(result.scoring.score.value.total).toBeLessThanOrEqual(35);
  });

  it("flags mock-tainted confidence", () => {
    const mockKp = kpDatum(series);
    const tainted = isKnown(mockKp)
      ? { ...mockKp, sources: mockKp.sources.map((s) => ({ ...s, origin: "mock" as const })) }
      : mockKp;
    const result = analyzeCountry(signals({ keywordMetrics: tainted }), options());
    expect(result.scoring.confidence.mockTainted).toBe(true);
  });
});

describe("analyzeCountry — margins and disabled statistics", () => {
  const LICENCE = "statistique dérivée désactivée en attendant la vérification de la licence";

  it("without a price, the country margins are DATA_INSUFFICIENT", () => {
    const result = analyzeCountry(signals({ keywordMetrics: kpDatum(series) }), options());
    expect(result.signals?.landedUnitCostEur?.status).toBe(DATA_INSUFFICIENT);
    expect(result.signals?.marginAtPlannedPrice?.status).toBe(DATA_INSUFFICIENT);
    expect(result.signals?.minPriceForTargetMargin?.status).toBe(DATA_INSUFFICIENT);
  });

  it("computes the margin at the owner's price from the typed inputs", () => {
    const vat = observed({ country: "FR" as const, standardRatePct: 20, source: testSource("vat-rates") }, "percent", [testSource("vat-rates")]);
    const base = signals();
    const result = analyzeCountry(signals({ v2: { ...base.v2, vat } }), {
      ...options(),
      economics: { currency: "EUR" as const, sellingPrice: 30, supplierPrice: 8, shippingCost: 3, targetMarginPct: 40 },
    });
    const s = result.signals;
    expect(s?.landedUnitCostEur && isKnown(s.landedUnitCostEur) && s.landedUnitCostEur.value).toBe(11);
    expect(s?.marginAtPlannedPrice && isKnown(s.marginAtPlannedPrice) && s.marginAtPlannedPrice.value).toBe(56);
    expect(s?.minPriceForTargetMargin && isKnown(s.minPriceForTargetMargin) && s.minPriceForTargetMargin.value).toEqual({ targetMarginPct: 40, exVatEur: 18.33, inclVatEur: 22 });
    expect(s?.marketMarginPct).toBeUndefined();
    expect(s?.marketPriceExVatEur).toBeUndefined();
  });

  it("scores the unit economics on the price excluding VAT", () => {
    const vat = observed({ country: "FR" as const, standardRatePct: 20, source: testSource("vat-rates") }, "percent", [testSource("vat-rates")]);
    const base = signals({ keywordMetrics: kpDatum(series) });
    const result = analyzeCountry(signals({ keywordMetrics: kpDatum(series), v2: { ...base.v2, vat } }), {
      ...options(),
      economics: { currency: "EUR" as const, sellingPrice: 30, supplierPrice: 8, shippingCost: 3 },
    });
    const cpa = result.advertising.find((c) => c.platform === "google")!.cpa;
    const unit = result.scoring.criteria.find((c) => c.id === "unit_economics")!;
    expect(isKnown(cpa)).toBe(true);
    // 30 € incl. VAT → 25 € excl. VAT; 25 − 11 € landed = 14 € of margin, not 19 €.
    if (isKnown(cpa)) expect(unit.rawValue).toBe(Math.round((cpa.value.p50 / 14) * 100) / 100);
    expect(unit.explanation).toContain("hors TVA");
  });

  it("leaves the unit economics insufficient when the country VAT is unknown", () => {
    const result = analyzeCountry(signals({ keywordMetrics: kpDatum(series) }), options(30, 10));
    const unit = result.scoring.criteria.find((c) => c.id === "unit_economics")!;
    expect(unit.status).toBe(DATA_INSUFFICIENT);
    expect(unit.explanation).toMatch(/TVA/);
  });

  it("market margin and video interest are insufficient pending the licence check", () => {
    const result = analyzeCountry(signals({ keywordMetrics: kpDatum(series) }), options(30, 10));
    for (const id of ["market_margin", "video_interest"] as const) {
      const c = result.scoring.criteria.find((x) => x.id === id)!;
      expect(c.status).toBe(DATA_INSUFFICIENT);
      expect(c.explanation.toLowerCase()).toContain(LICENCE);
    }
  });

  it("uses scoring model 2026.10-v3", () => {
    expect(SCORING_MODEL_VERSION).toBe("2026.10-v3");
  });
});

describe("decide", () => {
  it("never recommends with low confidence", () => {
    const score = { status: "known" as const, kind: "estimate" as const, value: { total: 90, coverage: 1, criteria: [], modelVersion: "t" }, unit: "score_0_100" as const, sources: [] };
    const confidence = (value: number) => ({ score: value, level: "low" as const, factors: [], mockTainted: false });
    expect(decide(score, confidence(30))).toBe("exploratory_only");
    expect(decide(score, confidence(70))).toBe("prioritize");
    expect(decide({ ...score, value: { ...score.value, total: 55 } }, confidence(70))).toBe("test_carefully");
    expect(decide({ ...score, value: { ...score.value, total: 20 } }, confidence(70))).toBe("avoid");
  });
});
