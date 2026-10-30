import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/config/env";
import type { ProductQuery } from "@/domain/product";
import { MemoryCacheRepository } from "@/server/repositories/memory-repositories";
import { addMachineTranslations } from "@/server/pipeline/translate";
import type { TopicInterestProvider, TranslationProvider } from "./contracts";
import { fail, ok } from "./contracts";
import { UkTradeTariffProvider } from "./customs/uk-trade-tariff";
import { GoogleAdsKeywordPlannerProvider } from "./google-ads/adapter";
import { parseHistoricalMetrics } from "./google-ads/parse";
import { TikTokCommercialContentProvider } from "./tiktok-commercial/adapter";
import { parseMyMemory } from "./translation/mymemory";

/** Regressions from the API audit, with the shapes the real services documented or answered. */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return handler(String(input), init);
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("TikTok Commercial Content", () => {
  const env = { TIKTOK_CLIENT_KEY: "key", TIKTOK_CLIENT_SECRET: "secret" } as ServerEnv;
  const query = { terms: ["x".repeat(80)], country: "DE" as const, since: "2026-08-01" };
  const ad = { ad: { id: 1, first_shown_date: 20260901 }, advertiser: { business_id: 9 } };

  it("sends what the documentation allows: at most 10 ads, a country list, a 50-character term", async () => {
    const calls = stubFetch((url) => (url.includes("/oauth/token/") ? json({ access_token: "t" }) : json({ data: { ads: [ad], has_more: false }, error: { code: "ok" } })));
    expect((await new TikTokCommercialContentProvider(env, 500).getAdActivity(query)).ok).toBe(true);
    const body = JSON.parse(String(calls.find((c) => c.url.includes("/ad/query/"))?.init?.body)) as {
      max_count: number;
      search_term: string;
      filters: Record<string, unknown>;
    };
    expect(body.max_count).toBe(10);
    expect(body.search_term).toHaveLength(50);
    expect(body.filters.country_code_list).toEqual(["DE"]);
    expect(body.filters.country_code).toBeUndefined();
  });

  it("reads the documented example: has_more as a string, a misspelled advertiser id", async () => {
    let page = 0;
    stubFetch((url) => {
      if (url.includes("/oauth/token/")) return json({ access_token: "t" });
      page += 1;
      return json({
        data: { ads: [{ ad: { id: page, first_shown_date: 20260901 }, advertiser: { buisness_id: 7 } }], has_more: page === 1 ? "true" : "false", search_id: "s" },
        error: { code: "ok" },
      });
    });
    const result = await new TikTokCommercialContentProvider(env, 500).getAdActivity(query);
    expect(page).toBe(2);
    expect(result).toMatchObject({ ok: true, data: { truncated: false } });
  });

  it("keeps the real reason of an error sent with HTTP 200 and no data", async () => {
    stubFetch((url) => (url.includes("/oauth/token/") ? json({ access_token: "t" }) : json({ error: { code: "rate_limit_exceeded", message: "secret detail" } })));
    const result = await new TikTokCommercialContentProvider(env, 500).getAdActivity(query);
    expect(result).toMatchObject({ ok: false, error: { code: "rate_limited", message: "TikTok adlib: rate_limit_exceeded" } });
    expect(JSON.stringify(result)).not.toContain("secret detail");
  });

  it("counts an ad that comes without its advertiser", async () => {
    stubFetch((url) => (url.includes("/oauth/token/") ? json({ access_token: "t" }) : json({ data: { ads: [{ ad: { id: 5, first_shown_date: 20260901 } }], has_more: false } })));
    expect(await new TikTokCommercialContentProvider(env, 500).getAdActivity(query)).toMatchObject({ ok: true });
  });
});

describe("customs classification", () => {
  const fuzzyBottleCaps = { data: { attributes: { type: "fuzzy_match", goods_nomenclature_match: { commodities: [{ _source: { goods_nomenclature_item_id: "3923501000" } }] } } } };

  it("never uses a fuzzy match: « cap » must not become bottle caps", async () => {
    const calls = stubFetch(() => json(fuzzyBottleCaps));
    const result = await new UkTradeTariffProvider(new MemoryCacheRepository(), 500).classify("cap");
    expect(result).toMatchObject({ ok: false, error: { code: "no_data" } });
    expect(calls.every((c) => c.url.includes("/search?"))).toBe(true);
  });

  it("keeps an exact match", async () => {
    stubFetch((url) =>
      url.includes("/search?")
        ? json({ data: { attributes: { type: "exact_match", entry: { endpoint: "commodities", id: "6505003000" } } } })
        : json({ data: { type: "commodity", attributes: { description_plain: "Hats" } } }),
    );
    const result = await new UkTradeTariffProvider(new MemoryCacheRepository(), 500).classify("baseball cap");
    expect(result).toMatchObject({ ok: true, data: [{ code: "6505003000" }] });
  });
});

describe("machine translation", () => {
  const answer = (matches: unknown[], translatedText = "Deckel") => ({ responseStatus: 200, quotaFinished: false, responseData: { translatedText, match: 1 }, matches });

  it("ignores an anonymous entry and takes the best reviewed one (real answer for casquette in German)", () => {
    const result = parseMyMemory(
      answer([
        { translation: "Deckel", quality: "0", match: 1 },
        { translation: "Cap", quality: 74, match: 0.99 },
        { translation: "Schirmmuetze", quality: "68", match: 0.99 },
      ]),
    );
    expect(result).toEqual({ ok: true, data: { text: "Cap", match: 0.99 } });
  });

  it("refuses a translation nobody reviewed", () => {
    expect(parseMyMemory(answer([{ translation: "Deckel", quality: "0", match: 1 }]))).toMatchObject({ ok: false, error: { code: "no_data" } });
  });

  it("still reads an answer without an entry list", () => {
    expect(parseMyMemory({ responseStatus: 200, responseData: { translatedText: "cap", match: 1 } })).toEqual({ ok: true, data: { text: "cap", match: 1 } });
  });

  const product = { displayName: "casquette", inputLanguage: "fr", terms: [{ term: "casquette", language: "fr", kind: "exact", source: "user" }] } as unknown as ProductQuery;
  const translator = { translate: vi.fn(async () => ok({ text: "Deckel", match: 1 })) } as unknown as TranslationProvider;

  it("prefers the Wikidata concept, without its disambiguation, and leaves the rest to the translator", async () => {
    const topic = {
      resolveEntity: async () => ok({ wikidataId: "Q1", article: "Casquette", englishLabel: "cap" }),
      conceptTitle: async (_: string, language: string) => (language === "de" ? "Mütze" : language === "en" ? "Cap (headgear)" : null),
    } as unknown as TopicInterestProvider;
    const { product: out } = await addMachineTranslations(product, ["DE", "ES"], translator, topic);
    const term = (language: string) => out.terms.find((t) => t.language === language)?.term;
    expect(term("de")).toBe("mütze");
    expect(term("en")).toBe("cap");
    expect(term("es")).toBe("deckel");
  });

  it("uses the translator when the name is no known concept", async () => {
    const topic = { resolveEntity: async () => fail("no_data", "none"), conceptTitle: vi.fn() } as unknown as TopicInterestProvider;
    const { product: out } = await addMachineTranslations(product, ["DE"], translator, topic);
    expect(out.terms.find((t) => t.language === "de")?.term).toBe("deckel");
    expect(topic.conceptTitle).not.toHaveBeenCalled();
  });
});

describe("Google Ads average CPC", () => {
  const source = { sourceId: "google-ads-keyword-planner", origin: "live", collectedAt: "2026-10-01", connectorVersion: "1", queryRef: "q" } as never;

  it("reads the average CPC in currency units", () => {
    const result = parseHistoricalMetrics({ results: [{ text: "cap", keywordMetrics: { lowTopOfPageBidMicros: "400000", highTopOfPageBidMicros: "1200000", averageCpcMicros: "550000" } }] }, "USD", source);
    expect(result).toMatchObject({ ok: true, data: [{ averageCpc: 0.55, lowTopOfPageBid: 0.4, currency: "USD" }] });
  });

  it("asks Google for it", () => {
    expect(GoogleAdsKeywordPlannerProvider.prototype.getKeywordMetrics.toString()).toContain("includeAverageCpc: true");
  });
});
