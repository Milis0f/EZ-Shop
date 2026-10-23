import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/config/env";
import { MemoryCacheRepository } from "@/server/repositories/memory-repositories";
import { AliExpressProvider, parseAliExpress, signAliExpress } from "./aliexpress/adapter";
import { isTariffDocument, parseApplicableMeasures, parseHeadingLeaves, parseSearch } from "./customs/uk-tariff-parse";
import { isUsitcPayload, parseUsLines, parseUsRate, specialRateFor } from "./customs/usitc";
import { describeEbayError, EbayBrowseProvider, isEbaySearch } from "./ebay/adapter";
import { isJsonStat } from "./eurostat/adapter";
import { parseSuggestions } from "./google-autocomplete/adapter";
import { toEur } from "./reference/ecb-fx";
import { parseVatRates, VatRatesProvider } from "./reference/vat-rates";
import { isWorldBankData } from "./world-bank/adapter";
import {
  isPageviews,
  isTitleBatch,
  isWikidataEntities,
  parseEnglishLabel,
  parsePageviews,
  parseTitleBatch,
  parseTitleLookup,
  titleCandidates,
  WikimediaProvider,
} from "./wikimedia/adapter";
import { describeGoogleApiError, YouTubeProvider } from "./youtube/adapter";

/** Parsers and adapters of data sources v2 — stubbed fetch only, no network, no real credentials. */

const SECRET = "SECRET-VALUE-42";
const baseEnv = { NODE_ENV: "test", PGLITE_DATA_DIR: ".data/test", PROVIDER_HTTP_TIMEOUT_MS: 1000 } as ServerEnv;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    return handler(url, init);
  }));
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("Google Autocomplete", () => {
  it("reads the suggestion list of the firefox client format", () => {
    expect(parseSuggestions(["chaussettes", ["chaussettes chauffantes", " chaussettes amazon "]])).toEqual({ ok: true, data: ["chaussettes chauffantes", "chaussettes amazon"] });
    expect(parseSuggestions({ unexpected: true }).ok).toBe(false);
  });
});

describe("Wikimedia", () => {
  it("tries the full term, then single words in the language's noun order", () => {
    expect(titleCandidates(["chaussettes chauffantes"], "fr")).toEqual(["Chaussettes chauffantes", "Chaussettes"]);
    expect(titleCandidates(["beheizbare Socken"], "de")).toEqual(["Beheizbare Socken", "Socken"]);
    expect(titleCandidates(["lampe de bureau led"], "fr")).toEqual(["Lampe de bureau led", "Lampe de bureau", "Lampe"]);
    expect(titleCandidates(["led desk lamp"], "en")).toEqual(["Led desk lamp", "Desk lamp", "Lamp"]);
    expect(titleCandidates(["gourde isotherme"], "fr")).toEqual(["Gourde isotherme", "Gourde"]);
  });

  it("resolves every candidate in one request, through normalisation and redirects, skipping disambiguations", () => {
    const payload = {
      query: {
        normalized: [{ from: "Chaussettes", to: "Chaussettes" }],
        redirects: [{ from: "Chaussettes", to: "Chaussette" }],
        pages: {
          "-1": { title: "Chaussettes chauffantes", missing: "" },
          "12": { title: "Chaussette", pageprops: { wikibase_item: "Q43663" } },
        },
      },
    };
    expect(parseTitleBatch(payload, ["Chaussettes chauffantes", "Chaussettes"])).toEqual({ title: "Chaussette", wikidataId: "Q43663" });
    const disambiguation = { query: { pages: { "5": { title: "Gourde", pageprops: { wikibase_item: "Q1", disambiguation: "" } } } } };
    expect(parseTitleBatch(disambiguation, ["Gourde"])).toBeNull();
  });

  it("keeps only real articles, never disambiguation pages", () => {
    const page = (extra: object) => ({ query: { pages: { "1": { title: "Chaussette", ...extra } } } });
    expect(parseTitleLookup(page({ pageprops: { wikibase_item: "Q43663" } }))).toEqual({ title: "Chaussette", wikidataId: "Q43663" });
    expect(parseTitleLookup(page({ pageprops: { wikibase_item: "Q1", disambiguation: "" } }))).toBeNull();
    expect(parseTitleLookup(page({ missing: "" }))).toBeNull();
  });

  it("maps monthly pageviews and the English Wikidata label", () => {
    expect(parsePageviews({ items: [{ timestamp: "2026010100", views: 1200 }] })).toEqual({ ok: true, data: [{ month: "2026-01", value: 1200 }] });
    expect(parseEnglishLabel({ entities: { Q43663: { labels: { en: { value: "sock" } } } } }, "Q43663")).toBe("sock");
  });

  describe("response cache", () => {
    const noMatch = { batchcomplete: "", query: { pages: { "-1": { title: "Xyzzy", missing: "" } } } };
    const article = { query: { pages: { "7": { title: "Xyzzy", pageprops: { wikibase_item: "Q42" } } } } };
    const entity = { entities: { Q42: { labels: { en: { value: "xyzzy" } } } } };

    it("keeps a well-formed title lookup without a match cached", async () => {
      const calls = stubFetch(() => json(noMatch));
      const provider = new WikimediaProvider(new MemoryCacheRepository(), 500);

      expect(await provider.resolveEntity(["xyzzy"], "fr")).toMatchObject({ ok: false, error: { code: "no_data" } });
      expect(await provider.resolveEntity(["xyzzy"], "fr")).toMatchObject({ ok: false, error: { code: "no_data" } });
      expect(calls).toHaveLength(1);
    });

    it("does not cache a MediaWiki error answer returned with HTTP 200", async () => {
      let titleLookups = 0;
      const calls = stubFetch((url) => {
        if (url.includes("wikidata.org")) return json(entity);
        titleLookups += 1;
        return json(titleLookups === 1 ? { error: { code: "internal_api_error_DBQueryError", info: "Exception caught" }, servedby: "mw1" } : article);
      });
      const provider = new WikimediaProvider(new MemoryCacheRepository(), 500);

      expect(await provider.resolveEntity(["xyzzy"], "fr")).toMatchObject({ ok: false, error: { code: "no_data" } });
      expect(await provider.resolveEntity(["xyzzy"], "fr")).toMatchObject({ ok: true, data: { wikidataId: "Q42", englishLabel: "xyzzy" } });
      expect(calls.filter((c) => !c.url.includes("wikidata.org"))).toHaveLength(2);
    });
  });
});

describe("Trade Tariff parsing", () => {
  it("recognises exact, fuzzy and empty searches", () => {
    expect(parseSearch({ data: { attributes: { type: "exact_match", entry: { endpoint: "subheadings", id: "6115940000-10" } } } })).toEqual({ kind: "exact", endpoint: "subheadings", id: "6115940000-10" });
    expect(parseSearch({ data: { attributes: { type: "fuzzy_match", goods_nomenclature_match: { commodities: [{ _source: { goods_nomenclature_item_id: "8516800000" } }] } } } })).toEqual({ kind: "fuzzy", codes: ["8516800000"] });
    expect(parseSearch({ data: { attributes: { type: "fuzzy_match", goods_nomenclature_match: { chapters: [], headings: [], commodities: [] } } } })).toEqual({ kind: "none" });
  });

  it("lists the declarable lines under a code", () => {
    const heading = {
      included: [
        { id: "1", type: "commodity", attributes: { goods_nomenclature_item_id: "6115950000", leaf: true, description: "Of cotton" } },
        { id: "2", type: "commodity", attributes: { goods_nomenclature_item_id: "6115960000", leaf: false, description: "Of synthetic fibres" } },
        { id: "3", type: "commodity", attributes: { goods_nomenclature_item_id: "6115961000", leaf: true, description: "Knee-length" } },
      ],
    };
    expect(parseHeadingLeaves(heading, "611595").map((l) => l.code)).toEqual(["6115950000"]);
    expect(parseHeadingLeaves(heading, "6115").map((l) => l.code)).toEqual(["6115950000", "6115961000"]);
  });

  it("applies erga omnes, group preferences and origin-specific measures for the given origin only", () => {
    const measure = (id: string, type: string, duty: string, geo: string) => ({
      id,
      type: "measure",
      attributes: { import: true },
      relationships: { measure_type: { data: { id: `t${id}`, type: "measure_type" } }, duty_expression: { data: { id: `d${id}`, type: "duty_expression" } }, geographical_area: { data: { id: geo, type: "geographical_area" } } },
    });
    const meta = (id: string, type: string, duty: string) => [
      { id: `t${id}`, type: "measure_type", attributes: { description: type } },
      { id: `d${id}`, type: "duty_expression", attributes: { base: duty } },
    ];
    const payload = {
      included: [
        measure("1", "", "", "1011"), ...meta("1", "Third country duty", "12.00 %"),
        measure("2", "", "", "1011"), ...meta("2", "Low-value consignment customs duty", "3.00 EUR"),
        measure("3", "", "", "2005"), ...meta("3", "Tariff preference", "0.00 %"),
        measure("4", "", "", "CN"), ...meta("4", "Definitive anti-dumping duty", "25.80 %"),
        { id: "2005", type: "geographical_area", relationships: { children_geographical_areas: { data: [{ id: "VN", type: "geographical_area" }] } } },
      ],
    };
    expect(parseApplicableMeasures(payload, "CN")).toEqual({ thirdCountryPct: 12, preferencePct: null, lowValueFlat: 3, other: ["Definitive anti-dumping duty : 25.80 %"] });
    expect(parseApplicableMeasures(payload, "VN")).toMatchObject({ thirdCountryPct: 12, preferencePct: 0, other: [] });
  });
});

describe("USITC", () => {
  it("parses general, special and column 2 rates", () => {
    expect(parseUsRate("Free")).toBe(0);
    expect(parseUsRate("13.5%")).toBe(13.5);
    expect(parseUsRate("4.9¢/kg + 10%")).toBeNull();
    expect(specialRateFor("Free (AU,BH,CL,KR)", "KR")).toBe(0);
    expect(specialRateFor("Free (AU,BH,CL,KR)", "CN")).toBeNull();
    const rows = [
      { htsno: "6115.95", general: null },
      { htsno: "6115.95.60.00", general: "10%", special: "Free (AU,KR)", other: "90%" },
      { htsno: "6115.95.90.00", general: "13.5%", special: "Free (AU,KR)", other: "51%", footnotes: [{ value: "See 9903.88.03." }] },
      { htsno: "9915.50.01", general: "No change" },
    ];
    expect(parseUsLines(rows, "611595", "CN").map((l) => l.ratePct)).toEqual([10, 13.5]);
    expect(parseUsLines(rows, "611595", "KR").map((l) => l.ratePct)).toEqual([0, 0]);
    expect(parseUsLines(rows, "611595", "RU").map((l) => l.ratePct)).toEqual([90, 51]);
    expect(parseUsLines(rows, "611595", "CN")[1].chapter99).toEqual(["See 9903.88.03."]);
  });
});

describe("AliExpress", () => {
  it("signs exactly like the official test vectors (business and system interfaces)", () => {
    const business = { access_token: "test", aliexpress_category_id: "200135143", app_key: "123456", method: "aliexpress.logistics.redefining.getonlinelogisticsinfo", sign_method: "sha256", timestamp: "1517820392000" };
    expect(signAliExpress(business, "helloworld")).toBe("F7F7926B67316C9D1E8E15F7E66940ED3059B1638C497D77973F30046EFB5BBB");
    const system = { app_key: "12345678", code: "3_500102_JxZ05Ux3cnnSSUm6dCxYg6Q26", sign_method: "sha256", timestamp: "1517820392000" };
    expect(signAliExpress(system, "helloworld", "/auth/token/create")).toBe("35607762342831B6A417A0DED84B79C05FEFBF116969C48AD6DC00279A9F4D81");
  });

  it("reads wrapped and streamlined responses, and reports API errors by code", () => {
    const product = { product_title: "Socks", target_sale_price: "2.35", target_sale_price_currency: "EUR", lastest_volume: "300", evaluate_rate: "92.1%", product_detail_url: "https://x" };
    const wrapped = { aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 200, result: { total_record_count: 120, products: { product: [product] } } } } };
    expect(parseAliExpress(wrapped)).toMatchObject({ ok: true, data: { total: 120, products: [{ price: 2.35, orders: 300, rating: 92.1 }] } });
    expect(parseAliExpress({ code: "0", resp_result: { result: { total_record_count: "5", products: [product] } } })).toMatchObject({ ok: true, data: { total: 5 } });
    expect(parseAliExpress({ error_response: { code: "IncompleteSignature", msg: "x" } })).toMatchObject({ ok: false, error: { code: "unauthorized", message: "AliExpress: HTTP 200 (IncompleteSignature)" } });
  });

  it("does not cache an error_response returned with HTTP 200", async () => {
    const env = { ...baseEnv, ALIEXPRESS_APP_KEY: "app-1", ALIEXPRESS_APP_SECRET: SECRET } as ServerEnv;
    const product = { product_title: "Socks", target_sale_price: "2.35", target_sale_price_currency: "EUR", product_detail_url: "https://x" };
    const valid = { resp_result: { resp_code: 200, result: { total_record_count: 1, products: [product] } } };
    let n = 0;
    const calls = stubFetch(() => json(++n === 1 ? { error_response: { code: "IncompleteSignature", msg: "x" } } : valid));
    const provider = new AliExpressProvider(env, new MemoryCacheRepository(), 500);

    expect(await provider.searchProducts({ terms: ["socks"], shipTo: "FR" })).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(await provider.searchProducts({ terms: ["socks"], shipTo: "FR" })).toMatchObject({ ok: true, data: { totalProducts: 1 } });
    expect(calls).toHaveLength(2);

    // A well-formed answer is cached as before.
    await provider.searchProducts({ terms: ["socks"], shipTo: "FR" });
    expect(calls).toHaveLength(2);
  });

  it("keeps a well-formed 'no products' answer (resp_code 405) cached, so empty queries do not spend quota", async () => {
    const env = { ...baseEnv, ALIEXPRESS_APP_KEY: "app-1", ALIEXPRESS_APP_SECRET: SECRET } as ServerEnv;
    const calls = stubFetch(() => json({ resp_result: { resp_code: 405, resp_msg: "No result", result: {} } }));
    const provider = new AliExpressProvider(env, new MemoryCacheRepository(), 500);

    expect(await provider.searchProducts({ terms: ["xyzzy"], shipTo: "FR" })).toMatchObject({ ok: false, error: { code: "no_data" } });
    expect(await provider.searchProducts({ terms: ["xyzzy"], shipTo: "FR" })).toMatchObject({ ok: false, error: { code: "no_data" } });
    expect(calls).toHaveLength(1);
  });
});

describe("eBay Browse", () => {
  const env = { ...baseEnv, EBAY_CLIENT_ID: "app-PRD-1", EBAY_CLIENT_SECRET: SECRET } as ServerEnv;

  it("gets an application token, then listings and the China-located count on the national site", async () => {
    const calls = stubFetch((url) => {
      if (url.endsWith("/identity/v1/oauth2/token")) return json({ access_token: "v^1.1#token", expires_in: 7200 });
      if (url.includes("itemLocationCountry")) return json({ total: 40 });
      return json({ total: 400, itemSummaries: [{ price: { value: "19.99", currency: "EUR" } }, { price: { value: "24.50", currency: "EUR" } }] });
    });
    const result = await new EbayBrowseProvider(env, new MemoryCacheRepository(), 500).getListings({ terms: ["chaussettes chauffantes"], country: "FR", language: "fr" });
    expect(result).toMatchObject({ ok: true, data: { marketplaceId: "EBAY_FR", total: 400, chinaTotal: 40, prices: [{ value: 19.99 }, { value: 24.5 }] } });
    const search = calls.find((c) => c.url.includes("/item_summary/search"))!;
    expect((search.init?.headers as Record<string, string>)["X-EBAY-C-MARKETPLACE-ID"]).toBe("EBAY_FR");
    expect(String((calls[0].init?.headers as Record<string, string>).Authorization)).toMatch(/^Basic /);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it.each([
    ["an empty object", {}],
    ["an errors body", { errors: [{ errorId: 1001 }] }],
  ])("refuses a 200 answer that is %s instead of reporting an observed total of 0", async (_label, body) => {
    stubFetch((url) => (url.endsWith("/identity/v1/oauth2/token") ? json({ access_token: "tok", expires_in: 7200 }) : json(body)));

    const result = await new EbayBrowseProvider(env, new MemoryCacheRepository(), 500).getListings({ terms: ["chaussettes"], country: "FR", language: "fr" });

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_response", message: "eBay search: unexpected response shape" } });
    expect(result).not.toHaveProperty("data");
  });

  it("reports chinaTotal as null, not 0, when the China-located search answers with an unexpected shape", async () => {
    stubFetch((url) => {
      if (url.endsWith("/identity/v1/oauth2/token")) return json({ access_token: "tok", expires_in: 7200 });
      return url.includes("itemLocationCountry") ? json({}) : json({ total: 12 });
    });

    const result = await new EbayBrowseProvider(env, new MemoryCacheRepository(), 500).getListings({ terms: ["chaussettes"], country: "FR", language: "fr" });

    expect(result).toMatchObject({ ok: true, data: { total: 12, chinaTotal: null } });
  });

  it("never borrows another country's site", async () => {
    const result = await new EbayBrowseProvider(env, new MemoryCacheRepository(), 500).getListings({ terms: ["x"], country: "LU", language: "fr" });
    expect(result).toMatchObject({ ok: false, error: { code: "unsupported_country" } });
  });

  it("keeps only error codes from eBay error bodies", () => {
    expect(describeEbayError(401, JSON.stringify({ error: "invalid_client", error_description: "client authentication failed" }))).toEqual({ reason: "invalid_client", code: "unauthorized" });
    expect(describeEbayError(400, JSON.stringify({ errors: [{ errorId: 12001, message: "long" }] }))).toEqual({ reason: "ebay_12001" });
  });
});

describe("YouTube Data API", () => {
  const env = { ...baseEnv, YOUTUBE_API_KEY: SECRET } as ServerEnv;

  it("counts videos for the country and reads their views, keeping the key out of every reference", async () => {
    const calls = stubFetch((url) =>
      url.includes("/search?")
        ? json({ pageInfo: { totalResults: 1200 }, items: [{ id: { videoId: "a" }, snippet: { publishedAt: "2026-09-01T00:00:00Z" } }, { id: { videoId: "b" }, snippet: { publishedAt: "2026-01-01T00:00:00Z" } }] })
        : json({ items: [{ id: "a", statistics: { viewCount: "5000" } }, { id: "b", statistics: { viewCount: "15000" } }] }),
    );
    const result = await new YouTubeProvider(env, new MemoryCacheRepository(), 500).getContent({ terms: ["chaussettes"], country: "FR", language: "fr", publishedAfter: "2025-10-15T00:00:00Z" });
    expect(result).toMatchObject({ ok: true, data: { totalResults: 1200, videos: [{ id: "a", views: 5000 }, { id: "b", views: 15000 }] } });
    expect(calls[0].url).toContain("regionCode=FR");
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("reads the Google API error reason only", () => {
    expect(describeGoogleApiError(403, JSON.stringify({ error: { status: "PERMISSION_DENIED", details: [{ reason: "SERVICE_DISABLED" }] } }))).toEqual({ reason: "SERVICE_DISABLED" });
    expect(describeGoogleApiError(403, JSON.stringify({ error: { errors: [{ reason: "quotaExceeded" }] } }))).toEqual({ reason: "quotaExceeded", code: "rate_limited" });
  });
});

describe("VAT and FX", () => {
  it("reads EU rates and adds the transcribed non-EU references", async () => {
    expect(parseVatRates([{ country_code: "FR", standard_rate: 20 }, { country_code: "EL", standard_rate: 24 }])).toMatchObject({ ok: true });
    stubFetch(() => json([{ country_code: "FR", standard_rate: 20 }, { country_code: "DE", standard_rate: 19 }]));
    const result = await new VatRatesProvider(new MemoryCacheRepository(), 500).getVatRates(["FR", "GB", "US", "CH"]);
    expect(result.ok && result.data.map((r) => [r.country, r.standardRatePct])).toEqual([["FR", 20], ["GB", 20], ["US", null], ["CH", 8.1]]);
  });

  it("converts with ECB reference rates (1 EUR = rate × currency)", () => {
    const fx = { date: "2026-10-15", rates: { EUR: 1, GBP: 0.8461 }, source: { sourceId: "ecb-fx" as const, origin: "live" as const, collectedAt: "", connectorVersion: "1" } };
    expect(toEur(84.61, "GBP", fx)).toBeCloseTo(100, 6);
    expect(toEur(10, "XXX", fx)).toBeNull();
  });
});

describe("cache validity predicates", () => {
  it("accept the expected shape, empty answers included, and reject error envelopes", () => {
    // Trade Tariff (JSON:API): a document with `data`, never one carrying `errors`.
    expect(isTariffDocument({ data: { attributes: {} }, included: [] })).toBe(true);
    expect(isTariffDocument({ errors: [{ detail: "Rate limit exceeded" }] })).toBe(false);
    expect(isTariffDocument({ data: {}, errors: [] })).toBe(false);
    expect(isTariffDocument(null)).toBe(false);
    expect(isTariffDocument([])).toBe(false);
    expect(isTariffDocument("Too many requests")).toBe(false);

    // USITC: a list of rows; an empty list is a valid "no line".
    expect(isUsitcPayload([])).toBe(true);
    expect(isUsitcPayload([{ htsno: "6115.95", general: "Free" }])).toBe(true);
    expect(isUsitcPayload({ error: "Bad request" })).toBe(false);
    expect(isUsitcPayload([{ htsno: 6115 }])).toBe(false);

    // Eurostat: a JSON-stat dataset, not the { error: [...] } answer.
    const dataset = { id: ["geo", "time"], size: [1, 1], value: { "0": 71 }, dimension: { geo: { category: { index: { FR: 0 } } }, time: { category: { index: { "2025": 0 } } } } };
    expect(isJsonStat(dataset)).toBe(true);
    expect(isJsonStat({ error: [{ status: 400, label: "Bad request" }] })).toBe(false);

    // World Bank: [paging, rows]; a country without data has null rows, the [{ message }] form is an error.
    expect(isWorldBankData([{ total: 0 }, null])).toBe(true);
    expect(isWorldBankData([{ total: 1 }, [{ indicator: { id: "X" }, country: { id: "FR" }, date: "2025", value: null }]])).toBe(true);
    expect(isWorldBankData([{ message: [{ id: "120", value: "Invalid value" }] }])).toBe(false);

    // eBay Browse: every member of the schema is optional, so the shape must carry `total` or `itemSummaries`.
    expect(isEbaySearch({ total: 0 })).toBe(true);
    expect(isEbaySearch({ total: 3, itemSummaries: [{ price: { value: "19.99", currency: "EUR" } }] })).toBe(true);
    expect(isEbaySearch({})).toBe(false);
    expect(isEbaySearch({ errors: [{ errorId: 1001 }] })).toBe(false);
    expect(isEbaySearch({ total: 3, errors: [{ errorId: 1001 }] })).toBe(false);
    expect(isEbaySearch({ total: "3" })).toBe(false);
    expect(isEbaySearch(null)).toBe(false);
    expect(isEbaySearch([])).toBe(false);
  });

  it("apply the same rule to Wikimedia answers", () => {
    expect(isTitleBatch({ query: { pages: { "-1": { title: "Xyzzy", missing: "" } } } })).toBe(true);
    expect(isTitleBatch({ error: { code: "maxlag", info: "Waiting for a database server" } })).toBe(false);
    expect(isTitleBatch(null)).toBe(false);

    expect(isPageviews({ items: [] })).toBe(true);
    expect(isPageviews({ type: "problem", title: "Not found", detail: "x" })).toBe(false);

    expect(isWikidataEntities({ entities: { Q1: { id: "Q1", missing: "" } }, success: 1 })).toBe(true);
    expect(isWikidataEntities({ error: { code: "no-such-entity" }, success: 0 })).toBe(false);
  });
});
