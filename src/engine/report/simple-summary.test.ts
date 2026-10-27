import { describe, expect, it } from "vitest";
import { buildAssumptions } from "@/config/assumptions";
import { insufficient, observed } from "@/domain/datum";
import { analyzeCountry, type CountrySignals } from "@/engine/analyze-country";
import { MyMemoryProvider, parseMyMemory } from "@/providers/translation/mymemory";
import { addMachineTranslations } from "@/server/pipeline/translate";
import { expandProduct } from "@/engine/terms/expand";
import { syntheticSeries, TEST_NOW, testSource } from "@/test/fixtures";
import { interestPerMonth, rankForSimple } from "./simple-summary";
import { verdictFor } from "./verdict";

const none = (p: string) => insufficient(`${p} indisponible`, [p]);

function country(code: "FR" | "DE", growth: number, withSuggestions: string[] | null) {
  const series = syntheticSeries({ months: 36, base: 3_000, annualGrowth: growth, amplitude: 0.4, peakMonth: 12 });
  const signals: CountrySignals = {
    country: code,
    terms: [{ term: "chaussettes chauffantes", language: "fr", kind: "input", source: "user" }],
    languageMismatch: false,
    keywordMetrics: none("google-ads-keyword-planner"),
    searchInterest: none("google-trends"),
    adActivity: { meta: none("meta-ad-library"), tiktok: none("tiktok-commercial-content") },
    adCosts: { meta: none("meta-marketing-api"), tiktok: none("tiktok-business-api") },
    macro: {},
    language: "fr",
    v2: {
      suggestions: withSuggestions
        ? observed({ suggestions: withSuggestions, source: testSource("google-autocomplete") }, "count", [testSource("google-autocomplete")])
        : none("google-autocomplete"),
      content: none("youtube-data"),
      listings: none("ebay-browse"),
      topicInterest: observed(
        { language: "fr" as const, article: "Chaussette", wikidataId: "Q43663", points: series, source: testSource("wikimedia") },
        "pageviews_per_month",
        [testSource("wikimedia")],
      ),
      duties: none("uk-trade-tariff"),
      vat: none("vat-rates"),
    },
    issues: [],
  };
  return analyzeCountry(signals, { assumptions: buildAssumptions(), economics: { currency: "EUR" }, now: TEST_NOW, seed: "t", qualityOf: () => 0.4 });
}

describe("simple summary", () => {
  it("says what the interest figure counts: Wikipedia readers when no search volume exists", () => {
    const fr = country("FR", 0.2, ["chaussettes chauffantes avis", "chaussettes chauffantes amazon"]);
    expect(interestPerMonth(fr)).toMatchObject({ direct: false, label: expect.stringContaining("Wikipédia « Chaussette »") });
  });

  it("explains a verdict without a score from the data that exists, and says what would unlock a score", () => {
    const v = verdictFor(country("FR", 0.2, ["chaussettes chauffantes avis"]));
    expect(v).toMatchObject({ value: "surveiller", label: "À SURVEILLER", blocking: [] });
    expect(v.supporting.join(" ")).toMatch(/Intérêt en hausse .*d'après Wikipédia/);
    expect(v.supporting.join(" ")).toContain("1 recherche d'achat");
    expect(v.supporting.find((r) => r.startsWith("Pic en"))).toMatch(/[^.]\.$/);
    expect(v.reason).toMatch(/^Données insuffisantes : sources à connecter, .*Google Ads/);
  });

  it("ranks rising interest first when no country has a score", () => {
    const ranked = rankForSimple([country("FR", -0.2, null), country("DE", 0.3, null)]);
    expect(ranked.map((c) => c.country)).toEqual(["DE", "FR"]);
  });
});

describe("machine translation", () => {
  it("rejects quota warnings and uncertain matches", () => {
    expect(parseMyMemory({ responseStatus: 200, responseData: { translatedText: "heated socks", match: 0.85 } })).toEqual({ ok: true, data: { text: "heated socks", match: 0.85 } });
    expect(parseMyMemory({ responseStatus: 200, quotaFinished: true, responseData: { translatedText: "x", match: 1 } })).toMatchObject({ ok: false, error: { code: "rate_limited" } });
    expect(parseMyMemory({ responseStatus: 200, responseData: { translatedText: "chaussures", match: 0.2 } })).toMatchObject({ ok: false, error: { code: "no_data" } });
  });

  it("translates only the market languages without a term, and never replaces the user's", async () => {
    const product = expandProduct({ productName: "Chaussettes chauffantes", inputLanguage: "fr", extraTerms: [{ language: "de", term: "beheizbare Socken" }] });
    const asked: string[] = [];
    const translator = {
      meta: new MyMemoryProvider({ get: async () => null, set: async () => undefined }, 500).meta,
      status: () => ({ state: "ready" as const, detail: "" }),
      translate: async (_t: string, _f: string, to: string) => {
        asked.push(to);
        return { ok: true as const, data: { text: to === "en" ? "Heated socks" : "calcetines calefactables", match: 0.9 } };
      },
    };
    const { product: out } = await addMachineTranslations(product, ["FR", "DE", "ES", "GB"], translator);
    expect(asked.toSorted()).toEqual(["en", "es"]);
    expect(out.terms.filter((t) => t.source === "machine").map((t) => [t.language, t.term])).toEqual([
      ["es", "calcetines calefactables"],
      ["en", "heated socks"],
    ]);
    expect(out.terms.find((t) => t.language === "de")?.source).toBe("user");
  });
});
