import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { ServerEnv } from "@/config/env";
import type { CountryCode, LanguageCode } from "@/domain/country";
import { MemoryCacheRepository } from "@/server/repositories/memory-repositories";
import { EbayBrowseProvider } from "./ebay/adapter";
import { GoogleAdsKeywordPlannerProvider } from "./google-ads/adapter";
import { ok } from "./contracts";
import { cached, httpJson, httpText } from "./http";
import { MetaAdLibraryProvider } from "./meta-ad-library/adapter";
import { OecdProvider } from "./oecd/adapter";
import { TikTokCommercialContentProvider } from "./tiktok-commercial/adapter";
import { MyMemoryProvider } from "./translation/mymemory";
import { WorldBankProvider } from "./world-bank/adapter";

/** HTTP-level tests with a stubbed fetch: no network, no real credentials. */

const SECRET = "SECRET-TOKEN-123";
const baseEnv = { NODE_ENV: "test", PGLITE_DATA_DIR: ".data/test", PROVIDER_HTTP_TIMEOUT_MS: 1000 } as ServerEnv;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    return handler(url, init);
  }));
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

type RecordedCall = { url: string; init?: RequestInit };
const countCalls = (calls: readonly RecordedCall[], matches: (call: RecordedCall) => boolean) => calls.filter(matches).length;

/** Fakes only the clock, so a token's lifetime can be crossed without waiting; real timers keep running. */
function fakeClock(start = "2026-10-16T12:00:00Z") {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(start));
  return (ms: number) => vi.setSystemTime(Date.now() + ms);
}

describe("http layer", () => {
  it("retries transient 5xx failures then succeeds", async () => {
    let n = 0;
    const calls = stubFetch(() => (++n === 1 ? new Response("boom", { status: 503 }) : new Response("ok")));
    const result = await httpText("https://x.test/a", "X", { timeoutMs: 500, attempts: 2 });
    expect(result).toEqual({ ok: true, data: "ok" });
    expect(calls).toHaveLength(2);
  });

  it("maps auth, rate-limit and not-found statuses without retrying auth errors", async () => {
    const calls = stubFetch(() => new Response("", { status: 401 }));
    expect(await httpText("https://x.test", "X", { timeoutMs: 500, attempts: 3 })).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(calls).toHaveLength(1);
    stubFetch(() => new Response("", { status: 429 }));
    expect(await httpText("https://x.test", "X", { timeoutMs: 500, attempts: 1 })).toMatchObject({ ok: false, error: { code: "rate_limited", retryable: true } });
    stubFetch(() => new Response("", { status: 404 }));
    expect(await httpText("https://x.test", "X", { timeoutMs: 500 })).toMatchObject({ ok: false, error: { code: "no_data" } });
  });

  it("maps timeouts and network errors", async () => {
    stubFetch(() => {
      throw Object.assign(new Error("t"), { name: "TimeoutError" });
    });
    expect(await httpText("https://x.test", "X", { timeoutMs: 500, attempts: 1 })).toMatchObject({ ok: false, error: { code: "timeout" } });
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(await httpText("https://x.test", "X", { timeoutMs: 500, attempts: 1 })).toMatchObject({ ok: false, error: { code: "upstream_error" } });
  });

  it("rejects invalid JSON", async () => {
    stubFetch(() => new Response("<html>"));
    expect(await httpJson("https://x.test", "X", { timeoutMs: 500 })).toMatchObject({ ok: false, error: { code: "invalid_response" } });
  });

  it("httpJson returns storage-safe strings", async () => {
    stubFetch(() => new Response('{"title":"x\\u0000y","\\u0000k":["\\ud800"]}'));
    expect(await httpJson("https://x.test", "X", { timeoutMs: 500 })).toEqual({ ok: true, data: { title: "xy", k: ["�"] } });
  });

  it("httpJson reports colliding keys as an invalid response", async () => {
    stubFetch(() => new Response('{"a\\u0000":1,"a":2}'));
    const result = await httpJson("https://x.test", "X", { timeoutMs: 500 });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_response", message: "X: response keys are not storable" } });
  });

  it("httpJson keeps the JSON failure message for text that is not JSON", async () => {
    stubFetch(() => new Response("<html>"));
    expect(await httpJson("https://x.test", "X", { timeoutMs: 500 })).toMatchObject({
      ok: false,
      error: { code: "invalid_response", message: "X: response is not valid JSON" },
    });
  });

  it("serves the second call from cache", async () => {
    const calls = stubFetch(() => json({ v: 1 }));
    const cache = new MemoryCacheRepository();
    const load = () => httpJson("https://x.test/c", "X", { timeoutMs: 500 });
    await cached(cache, "k", "p", 60, load, () => true);
    const second = await cached(cache, "k", "p", 60, load, () => true);
    expect(second).toMatchObject({ ok: true, data: { v: 1 }, fromCache: true });
    expect(calls).toHaveLength(1);
  });
});

describe("cached", () => {
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("treats a cache value that makes an adapter validator throw as a miss", async () => {
    const cache = new MemoryCacheRepository();
    await cache.set("k", "oecd", {}, 60);
    const xml = "<GenericData />";
    const load = vi.fn(async () => ok(xml));

    const result = await cached(cache, "k", "oecd", 60, load, (value) => value.includes("GenericData"));

    expect(result).toEqual({ ok: true, data: xml });
    expect(load).toHaveBeenCalledOnce();
    // The bad entry is overwritten by the fresh answer, and an invalid entry is not worth a log line.
    expect(await cache.get("k")).toBe(xml);
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns a loaded payload whose validator throws, stores nothing and logs one controlled line", async () => {
    const cache = new MemoryCacheRepository();
    const loaded = ok({ title: "fresh" });
    const isValid = (): boolean => {
      throw new Error(`boom ${SECRET} payload`);
    };

    const result = await cached(cache, "k", "p", 60, async () => loaded, isValid);

    expect(result).toBe(loaded);
    expect(await cache.get("k")).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("[cache] p validate failed: Error");
    const printed = warn.mock.calls.flat().map(String).join(" ");
    expect(printed).not.toContain(SECRET);
    expect(printed).not.toContain("boom");
  });

  it("does not store a payload the adapter rejects", async () => {
    const cache = new MemoryCacheRepository();
    const result = await cached(cache, "k", "p", 60, async () => ok({ error: true }), () => false);
    // The payload is still returned, so the adapter's own parser can report the error.
    expect(result).toEqual({ ok: true, data: { error: true } });
    expect(await cache.get("k")).toBeNull();
  });

  it("ignores an invalid entry already in the cache and replaces it", async () => {
    const cache = new MemoryCacheRepository();
    await cache.set("k", "p", { stale: true }, 60);
    const isValid = (payload: { stale?: true; fresh?: true }) => payload.fresh === true;
    const result = await cached(cache, "k", "p", 60, async () => ok<{ stale?: true; fresh?: true }>({ fresh: true }), isValid);
    expect(result).toEqual({ ok: true, data: { fresh: true } });
    expect(await cache.get("k")).toEqual({ fresh: true });
  });

  it("serves a valid entry without loading", async () => {
    const cache = new MemoryCacheRepository();
    await cache.set("k", "p", { v: 1 }, 60);
    const load = vi.fn(async () => ok({ v: 2 }));
    const result = await cached(cache, "k", "p", 60, load, () => true);
    expect(result).toEqual({ ok: true, data: { v: 1 }, fromCache: true });
    expect(load).not.toHaveBeenCalled();
  });
});

describe("cached when the cache fails", () => {
  const PAYLOAD_VALUE = "PAYLOAD-VALUE-9";
  const dbDown = () => new Error(`db down: payload ${SECRET}`);
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  /** Everything the warning printed, joined: the place where a leak would show. */
  const warned = () => warn.mock.calls.flat().map(String).join(" ");
  const expectNoLeak = () => {
    for (const forbidden of [SECRET, "db down", PAYLOAD_VALUE, "cache-key-abc"]) expect(warned()).not.toContain(forbidden);
  };

  it("still answers when the cache read throws", async () => {
    const cache = { get: vi.fn().mockRejectedValue(dbDown()), set: vi.fn().mockResolvedValue(undefined) };
    const load = vi.fn(async () => ok({ title: PAYLOAD_VALUE }));

    const result = await cached(cache, "cache-key-abc", "provider-x", 60, load, () => true);

    expect(result).toEqual({ ok: true, data: { title: PAYLOAD_VALUE } });
    expect(load).toHaveBeenCalledOnce();
    // A failed read is a miss: the answer is still stored.
    expect(cache.set).toHaveBeenCalledWith("cache-key-abc", "provider-x", { title: PAYLOAD_VALUE }, 60);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("[cache] provider-x read failed: Error");
    expectNoLeak();
  });

  it("still answers when the cache write throws", async () => {
    const cache = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockRejectedValue(dbDown()) };

    const result = await cached(cache, "cache-key-abc", "provider-x", 60, async () => ok({ title: PAYLOAD_VALUE }), () => true);

    expect(result).toEqual({ ok: true, data: { title: PAYLOAD_VALUE } });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("[cache] provider-x write failed: Error");
    expectNoLeak();
  });

  it("reports the SQLSTATE a database error carries, one level down", async () => {
    const driver = Object.assign(new Error(`unsupported escape ${SECRET}`), { name: "error", code: "22P05" });
    const wrapped = new Error(`Failed query: insert into provider_cache\nparams: ${PAYLOAD_VALUE}`, { cause: driver });
    const cache = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockRejectedValue(wrapped) };

    await cached(cache, "cache-key-abc", "provider-x", 60, async () => ok({ title: PAYLOAD_VALUE }), () => true);

    expect(warn).toHaveBeenCalledWith("[cache] provider-x write failed: Error (code 22P05)");
    expectNoLeak();
  });

  it("answers and warns twice when both the read and the write throw", async () => {
    const cache = { get: vi.fn().mockRejectedValue(dbDown()), set: vi.fn().mockRejectedValue(dbDown()) };

    const result = await cached(cache, "cache-key-abc", "provider-x", 60, async () => ok({ title: PAYLOAD_VALUE }), () => true);

    expect(result).toEqual({ ok: true, data: { title: PAYLOAD_VALUE } });
    expect(warn.mock.calls.map(([line]) => line)).toEqual(["[cache] provider-x read failed: Error", "[cache] provider-x write failed: Error"]);
    expectNoLeak();
  });

  it("does not warn about a write that is never attempted", async () => {
    const cache = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockRejectedValue(dbDown()) };

    const result = await cached(cache, "cache-key-abc", "provider-x", 60, async () => ok({ error: true }), () => false);

    expect(result).toEqual({ ok: true, data: { error: true } });
    expect(cache.set).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("OecdProvider cache", () => {
  const xml =
    '<?xml version="1.0"?><message:GenericData><generic:Series><generic:SeriesKey><generic:Value id="REF_AREA" value="FRA" /></generic:SeriesKey>' +
    '<generic:Obs><generic:ObsDimension id="TIME_PERIOD" value="2026-09" /><generic:ObsValue value="97.75892" /></generic:Obs></generic:Series></message:GenericData>';
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("treats a cached value that is not a string as a miss and replaces it", async () => {
    const calls = stubFetch(() => new Response(xml));
    const cache = new MemoryCacheRepository();
    const set = vi.spyOn(cache, "set");
    const provider = new OecdProvider(cache, 500, () => new Date("2026-10-16T12:00:00Z"));

    expect(await provider.getIndicators(["FR"])).toMatchObject({ ok: true, data: { observations: [{ country: "FR", value: 97.75892 }] } });
    expect(calls).toHaveLength(1);
    // The adapter's own key: the same request must find what is seeded under it.
    const key = String(set.mock.calls[0][0]);
    expect(key.startsWith("oecd:")).toBe(true);

    await cache.set(key, "oecd", { not: "a string" }, 60);
    const second = await provider.getIndicators(["FR"]);

    expect(second).toMatchObject({ ok: true, data: { observations: [{ country: "FR", value: 97.75892 }] } });
    expect(calls).toHaveLength(2);
    expect(await cache.get(key)).toBe(xml);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("WorldBankProvider", () => {
  it("does not cache a message envelope returned with HTTP 200", async () => {
    const rows = [{ indicator: { id: "X" }, country: { id: "FR" }, date: "2025", value: 42 }];
    let answerWithError = true;
    const calls = stubFetch(() => json(answerWithError ? [{ message: [{ id: "120", value: "Invalid value" }] }] : [{ total: 1 }, rows]));
    const provider = new WorldBankProvider(new MemoryCacheRepository(), 500);

    expect(await provider.getIndicators(["FR"])).toMatchObject({ ok: false, error: { code: "upstream_error" } });
    expect(calls).toHaveLength(3);

    answerWithError = false;
    expect(await provider.getIndicators(["FR"])).toMatchObject({ ok: true, data: { partialErrors: [] } });
    expect(calls).toHaveLength(6);

    // A well-formed answer is cached as before.
    expect(await provider.getIndicators(["FR"])).toMatchObject({ ok: true });
    expect(calls).toHaveLength(6);
  });

  it("reports partial failures instead of swallowing them", async () => {
    stubFetch((url) =>
      url.includes("IT.NET.USER.ZS")
        ? new Response("", { status: 400 })
        : json([{ total: 1 }, [{ indicator: { id: "X" }, country: { id: "FR" }, date: "2025", value: 42 }]]),
    );
    const result = await new WorldBankProvider(new MemoryCacheRepository(), 500).getIndicators(["FR"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.observations.map((o) => o.indicator).sort()).toEqual(["gdp_per_capita_ppp", "population"]);
    expect(result.data.partialErrors).toHaveLength(1);
  });
});

describe("MyMemoryProvider", () => {
  const translation = (translatedText: string, match: number) => ({ responseStatus: 200, quotaFinished: false, responseData: { translatedText, match } });

  it("does not cache a quota warning returned with HTTP 200", async () => {
    const quota = { responseStatus: 200, quotaFinished: true, responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY." } };
    let n = 0;
    const calls = stubFetch(() => json(++n === 1 ? quota : translation("heated socks", 0.98)));
    const provider = new MyMemoryProvider(new MemoryCacheRepository(), 500);

    expect(await provider.translate("chaussettes chauffantes", "fr", "en")).toMatchObject({ ok: false, error: { code: "rate_limited" } });
    expect(await provider.translate("chaussettes chauffantes", "fr", "en")).toMatchObject({ ok: true, data: { text: "heated socks" } });
    expect(calls).toHaveLength(2);
  });

  it("keeps an uncertain translation cached: it is a stable answer, not an error", async () => {
    const calls = stubFetch(() => json(translation("socks", 0.2)));
    const provider = new MyMemoryProvider(new MemoryCacheRepository(), 500);

    expect(await provider.translate("chaussettes chauffantes", "fr", "en")).toMatchObject({ ok: false, error: { code: "no_data" } });
    expect(await provider.translate("chaussettes chauffantes", "fr", "en")).toMatchObject({ ok: false, error: { code: "no_data" } });
    expect(calls).toHaveLength(1);
  });

  it("does not cache an upstream status error returned with HTTP 200", async () => {
    let n = 0;
    const calls = stubFetch(() => json(++n === 1 ? { responseStatus: 403, responseData: { translatedText: "INVALID TARGET LANGUAGE" } } : translation("heated socks", 0.98)));
    const provider = new MyMemoryProvider(new MemoryCacheRepository(), 500);

    expect(await provider.translate("chaussettes chauffantes", "fr", "en")).toMatchObject({ ok: false, error: { code: "upstream_error" } });
    expect(await provider.translate("chaussettes chauffantes", "fr", "en")).toMatchObject({ ok: true });
    expect(calls).toHaveLength(2);
  });
});

describe("MetaAdLibraryProvider", () => {
  const env = { ...baseEnv, META_GRAPH_API_VERSION: "v99.0", META_AD_LIBRARY_ACCESS_TOKEN: SECRET } as ServerEnv;

  it("is not configured without a token and out of coverage outside the EU", async () => {
    expect(new MetaAdLibraryProvider(baseEnv, 500).status().state).toBe("not_configured");
    const us = await new MetaAdLibraryProvider(env, 500).getAdActivity({ terms: ["socks"], country: "US", since: "2026-04-01" });
    expect(us).toMatchObject({ ok: false, error: { code: "unsupported_country" } });
  });

  it("follows pagination and aggregates ads", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const calls = stubFetch((url) =>
      url.includes("page=2")
        ? json({ data: [{ id: "3", page_id: "b", ad_delivery_start_time: today }] })
        : json({
            data: [
              { id: "1", page_id: "a", ad_delivery_start_time: "2026-09-01" },
              { id: "2", page_id: "a", ad_delivery_start_time: "2026-09-02", ad_delivery_stop_time: "2026-09-05" },
            ],
            paging: { next: "https://graph.facebook.com/next?page=2" },
          }),
    );
    const result = await new MetaAdLibraryProvider(env, 500).getAdActivity({ terms: ["chaussettes"], country: "FR", since: "2026-04-15" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.activeAds).toBe(2);
    expect(result.data.uniqueAdvertisers).toBe(2);
    expect(result.data.truncated).toBe(false);
    expect(calls[0].url).toContain("ad_reached_countries=%5B%22FR%22%5D");
    expect(result.data.source.queryRef).not.toContain(SECRET);
    expect(result.data.source.sourceUrl).not.toContain(SECRET);
  });

  it("never leaks the token in error messages", async () => {
    stubFetch(() => new Response("bad", { status: 400 }));
    const result = await new MetaAdLibraryProvider(env, 500).getAdActivity({ terms: ["x"], country: "FR", since: "2026-04-15" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).not.toContain(SECRET);
  });
});

describe("GoogleAdsKeywordPlannerProvider", () => {
  const env = {
    ...baseEnv,
    GOOGLE_ADS_API_VERSION: "v99",
    // Left over in an old .env.local: must never be sent (developer tokens were sunset on 2026-09-09).
    GOOGLE_ADS_DEVELOPER_TOKEN: SECRET,
    GOOGLE_ADS_CLIENT_ID: "cid",
    GOOGLE_ADS_CLIENT_SECRET: "csecret",
    GOOGLE_ADS_REFRESH_TOKEN: "refresh",
    GOOGLE_ADS_CUSTOMER_ID: "123-456-7890",
  } as ServerEnv;

  it("lists the missing variables when not configured", () => {
    const status = new GoogleAdsKeywordPlannerProvider(baseEnv, 500).status();
    expect(status.state).toBe("not_configured");
    expect(status.detail).toContain("GOOGLE_ADS_CLIENT_ID");
    expect(status.detail).not.toContain("DEVELOPER_TOKEN");
  });

  it("runs the OAuth → currency → language → historical metrics flow", async () => {
    const calls = stubFetch((url, init) => {
      if (url.startsWith("https://oauth2.googleapis.com")) return json({ access_token: "ya29" });
      const body = String(init?.body ?? "");
      if (url.endsWith("/googleAds:search") && body.includes("customer.currency_code")) return json({ results: [{ customer: { currencyCode: "EUR" } }] });
      if (url.endsWith("/googleAds:search")) return json({ results: [{ languageConstant: { resourceName: "languageConstants/1002" } }] });
      return json({ results: [{ text: "chaussettes", keywordMetrics: { avgMonthlySearches: "880", competitionIndex: "20" } }] });
    });
    const result = await new GoogleAdsKeywordPlannerProvider(env, 500).getKeywordMetrics({
      terms: ["chaussettes"],
      country: "FR",
      language: "fr",
      from: "2022-10",
      to: "2026-09",
    });
    expect(result).toMatchObject({ ok: true, data: [{ term: "chaussettes", avgMonthlySearches: 880, currency: "EUR" }] });

    const metricsCall = calls.find((c) => c.url.endsWith(":generateKeywordHistoricalMetrics"))!;
    expect(metricsCall.url).toBe("https://googleads.googleapis.com/v99/customers/1234567890:generateKeywordHistoricalMetrics");
    const body = JSON.parse(String(metricsCall.init?.body));
    expect(body.geoTargetConstants).toEqual(["geoTargetConstants/2250"]);
    expect(body.language).toBe("languageConstants/1002");
    expect(body.historicalMetricsOptions.yearMonthRange.start).toEqual({ year: 2022, month: "OCTOBER" });
    expect((metricsCall.init?.headers as Record<string, string>)["developer-token"]).toBeUndefined();
    expect(JSON.stringify(calls.map((c) => c.init?.headers))).not.toContain(SECRET);
  });

  describe("shared lookups", () => {
    const query = (country: CountryCode, language: LanguageCode = "fr") => ({ terms: ["chaussettes"], country, language, from: "2022-10", to: "2026-09" });
    const SIX_COUNTRIES = ["FR", "BE", "CH", "DE", "ES", "IT"] as const;
    const isToken = (call: RecordedCall) => call.url.startsWith("https://oauth2.googleapis.com");
    const isCurrency = (call: RecordedCall) => String(call.init?.body).includes("customer.currency_code");
    const isLanguage = (call: RecordedCall) => call.url.endsWith("/googleAds:search") && !isCurrency(call);
    const isMetrics = (call: RecordedCall) => call.url.endsWith(":generateKeywordHistoricalMetrics");

    const stubGoogleAds = (token: () => Response = () => json({ access_token: "ya29" })) =>
      stubFetch((url, init) => {
        if (url.startsWith("https://oauth2.googleapis.com")) return token();
        const body = String(init?.body ?? "");
        if (body.includes("customer.currency_code")) return json({ results: [{ customer: { currencyCode: "EUR" } }] });
        if (url.endsWith("/googleAds:search")) return json({ results: [{ languageConstant: { resourceName: "languageConstants/1002" } }] });
        return json({ results: [{ text: "chaussettes", keywordMetrics: { avgMonthlySearches: "880", competitionIndex: "20" } }] });
      });

    afterEach(() => vi.useRealTimers());

    it("shares the token, currency and language between 6 countries", async () => {
      const calls = stubGoogleAds();
      const provider = new GoogleAdsKeywordPlannerProvider(env, 500);

      const results = await Promise.all(SIX_COUNTRIES.map((country) => provider.getKeywordMetrics(query(country))));

      for (const result of results) expect(result).toMatchObject({ ok: true, data: [{ avgMonthlySearches: 880, currency: "EUR" }] });
      expect(countCalls(calls, isToken)).toBe(1);
      expect(countCalls(calls, isCurrency)).toBe(1);
      expect(countCalls(calls, isLanguage)).toBe(1);
      expect(countCalls(calls, isMetrics)).toBe(6);
    });

    it("looks each language up once", async () => {
      const calls = stubGoogleAds();
      const provider = new GoogleAdsKeywordPlannerProvider(env, 500);

      await Promise.all([
        ...(["FR", "BE", "CH"] as const).map((country) => provider.getKeywordMetrics(query(country, "fr"))),
        ...(["DE", "AT", "CH"] as const).map((country) => provider.getKeywordMetrics(query(country, "de"))),
      ]);

      expect(countCalls(calls, isToken)).toBe(1);
      expect(countCalls(calls, isCurrency)).toBe(1);
      expect(countCalls(calls, isLanguage)).toBe(2);
      expect(countCalls(calls, isMetrics)).toBe(6);
    });

    it("retries the token after a shared failure", async () => {
      let tokenRequests = 0;
      const calls = stubGoogleAds(() => (++tokenRequests === 1 ? new Response("", { status: 500 }) : json({ access_token: "ya29" })));
      const provider = new GoogleAdsKeywordPlannerProvider(env, 500);

      const failed = await Promise.all((["FR", "BE", "CH"] as const).map((country) => provider.getKeywordMetrics(query(country))));

      for (const result of failed) expect(result).toMatchObject({ ok: false, error: { code: "upstream_error", message: "Google OAuth token: HTTP 500" } });
      expect(calls).toHaveLength(1);

      expect(await provider.getKeywordMetrics(query("DE"))).toMatchObject({ ok: true });
      expect(countCalls(calls, isToken)).toBe(2);
    });

    it("fetches a new token once the 50 minutes are over", async () => {
      const advance = fakeClock();
      const calls = stubGoogleAds();
      const provider = new GoogleAdsKeywordPlannerProvider(env, 500);

      await provider.getKeywordMetrics(query("FR"));
      advance(50 * 60 * 1000 - 1);
      await provider.getKeywordMetrics(query("BE"));
      expect(countCalls(calls, isToken)).toBe(1);

      advance(1);
      await provider.getKeywordMetrics(query("CH"));
      expect(countCalls(calls, isToken)).toBe(2);
      // Currency and language have no expiry.
      expect(countCalls(calls, isCurrency)).toBe(1);
      expect(countCalls(calls, isLanguage)).toBe(1);
    });
  });
});

describe("EbayBrowseProvider", () => {
  const env = { ...baseEnv, EBAY_CLIENT_ID: "app-id", EBAY_CLIENT_SECRET: SECRET } as ServerEnv;
  const SIX_COUNTRIES = ["FR", "BE", "CH", "DE", "ES", "IT"] as const;
  const isToken = (call: RecordedCall) => call.url.includes("/identity/v1/oauth2/token");
  const isSearch = (call: RecordedCall) => call.url.includes("/buy/browse/v1/item_summary/search");
  const query = (country: CountryCode) => ({ terms: ["chaussettes"], country, language: "fr" as const });

  const stubEbay = (expiresIn = 7200) =>
    stubFetch((url) =>
      isToken({ url }) ? json({ access_token: "tok", expires_in: expiresIn }) : json({ total: 3, itemSummaries: [{ price: { value: "10.00", currency: "EUR" } }] }),
    );

  afterEach(() => vi.useRealTimers());

  it("shares the application token between 6 countries", async () => {
    const calls = stubEbay();
    const provider = new EbayBrowseProvider(env, new MemoryCacheRepository(), 500);

    const results = await Promise.all(SIX_COUNTRIES.map((country) => provider.getListings(query(country))));

    for (const result of results) expect(result).toMatchObject({ ok: true, data: { total: 3, chinaTotal: 3 } });
    expect(countCalls(calls, isToken)).toBe(1);
    // One listings search and one China search per country.
    expect(countCalls(calls, isSearch)).toBe(12);
  });

  it("retries the token after a shared failure", async () => {
    let tokenRequests = 0;
    const calls = stubFetch((url) => {
      if (!isToken({ url })) return json({ total: 1 });
      return ++tokenRequests === 1 ? json({ error: "invalid_client" }, 401) : json({ access_token: "tok", expires_in: 7200 });
    });
    const provider = new EbayBrowseProvider(env, new MemoryCacheRepository(), 500);

    const failed = await Promise.all((["FR", "BE", "CH"] as const).map((country) => provider.getListings(query(country))));

    for (const result of failed) expect(result).toMatchObject({ ok: false, error: { code: "unauthorized", message: "eBay OAuth token: HTTP 401 (invalid_client)" } });
    expect(calls).toHaveLength(1);
    expect(await provider.getListings(query("DE"))).toMatchObject({ ok: true });
    expect(countCalls(calls, isToken)).toBe(2);
  });

  it("keeps the token for expires_in minus 5 minutes", async () => {
    const advance = fakeClock();
    const calls = stubEbay(7200);
    const provider = new EbayBrowseProvider(env, new MemoryCacheRepository(), 500);

    await provider.getListings(query("FR"));
    advance((7200 - 300) * 1000 - 1);
    await provider.getListings(query("BE"));
    expect(countCalls(calls, isToken)).toBe(1);

    advance(1);
    await provider.getListings(query("CH"));
    expect(countCalls(calls, isToken)).toBe(2);
  });

  it("never keeps a token for less than 60 seconds", async () => {
    const advance = fakeClock();
    const calls = stubEbay(100);
    const provider = new EbayBrowseProvider(env, new MemoryCacheRepository(), 500);

    await provider.getListings(query("FR"));
    advance(60 * 1000 - 1);
    await provider.getListings(query("BE"));
    expect(countCalls(calls, isToken)).toBe(1);

    advance(1);
    await provider.getListings(query("CH"));
    expect(countCalls(calls, isToken)).toBe(2);
  });

  it("asks for a new token when the connection is diagnosed", async () => {
    const calls = stubEbay();
    const provider = new EbayBrowseProvider(env, new MemoryCacheRepository(), 500);

    await provider.getListings(query("FR"));
    const steps = await provider.diagnose(new Date(), "fr");

    expect(steps.map((step) => step.status)).toEqual(["ok", "ok"]);
    expect(countCalls(calls, isToken)).toBe(2);
  });
});

describe("TikTokCommercialContentProvider", () => {
  const env = { ...baseEnv, TIKTOK_CLIENT_KEY: "key", TIKTOK_CLIENT_SECRET: SECRET } as ServerEnv;

  it("exchanges client credentials and maps YYYYMMDD dates", async () => {
    stubFetch((url) =>
      url.includes("/oauth/token/")
        ? json({ access_token: "tok", expires_in: 7200 })
        : json({
            data: {
              ads: [
                { ad: { id: 1, first_shown_date: 20260901, last_shown_date: 20260903 }, advertiser: { business_id: 9 } },
                { ad: { id: 2, first_shown_date: 20260910 }, advertiser: { business_id: 9 } },
              ],
              has_more: false,
            },
            error: { code: "ok", message: "" },
          }),
    );
    const result = await new TikTokCommercialContentProvider(env, 500).getAdActivity({ terms: ["socken"], country: "DE", since: "2026-08-01" });
    expect(result).toMatchObject({ ok: true, data: { activeAds: 1, uniqueAdvertisers: 1, truncated: false } });
  });

  it("surfaces API-level errors", async () => {
    stubFetch((url) =>
      url.includes("/oauth/token/") ? json({ access_token: "tok" }) : json({ data: { ads: [] }, error: { code: "scope_not_authorized", message: "no" } }),
    );
    const result = await new TikTokCommercialContentProvider(env, 500).getAdActivity({ terms: ["x"], country: "DE", since: "2026-08-01" });
    expect(result).toMatchObject({ ok: false, error: { code: "unauthorized", message: "TikTok adlib: scope_not_authorized" } });
  });

  describe("shared client token", () => {
    const SIX_EU_COUNTRIES = ["FR", "BE", "LU", "DE", "ES", "IT"] as const;
    const isToken = (call: RecordedCall) => call.url.includes("/oauth/token/");
    const isQuery = (call: RecordedCall) => call.url.includes("/research/adlib/ad/query/");
    const query = (country: CountryCode) => ({ terms: ["socken"], country, since: "2026-08-01" });

    const stubTikTok = (expiresIn = 3600) =>
      stubFetch((url) =>
        isToken({ url })
          ? json({ access_token: "tok", expires_in: expiresIn })
          : json({
              data: { ads: [{ ad: { id: 1, first_shown_date: 20260901 }, advertiser: { business_id: 9 } }], has_more: false },
              error: { code: "ok", message: "" },
            }),
      );

    afterEach(() => vi.useRealTimers());

    it("shares the client token between 6 countries", async () => {
      const calls = stubTikTok();
      const provider = new TikTokCommercialContentProvider(env, 500);

      const results = await Promise.all(SIX_EU_COUNTRIES.map((country) => provider.getAdActivity(query(country))));

      for (const result of results) expect(result).toMatchObject({ ok: true, data: { activeAds: 1 } });
      expect(countCalls(calls, isToken)).toBe(1);
      expect(countCalls(calls, isQuery)).toBe(6);
    });

    it("retries the token after a shared failure", async () => {
      let tokenRequests = 0;
      const calls = stubFetch((url) => {
        if (!isToken({ url })) return json({ data: { ads: [] }, error: { code: "ok", message: "" } });
        return ++tokenRequests === 1 ? new Response("", { status: 500 }) : json({ access_token: "tok" });
      });
      const provider = new TikTokCommercialContentProvider(env, 500);

      const failed = await Promise.all((["FR", "BE", "DE"] as const).map((country) => provider.getAdActivity(query(country))));

      for (const result of failed) expect(result).toMatchObject({ ok: false, error: { code: "upstream_error", message: "TikTok client token: HTTP 500" } });
      expect(calls).toHaveLength(1);
      expect(await provider.getAdActivity(query("ES"))).toMatchObject({ ok: true });
      expect(countCalls(calls, isToken)).toBe(2);
    });

    it("keeps the token for expires_in minus 2 minutes", async () => {
      const advance = fakeClock();
      const calls = stubTikTok(3600);
      const provider = new TikTokCommercialContentProvider(env, 500);

      await provider.getAdActivity(query("FR"));
      advance((3600 - 120) * 1000 - 1);
      await provider.getAdActivity(query("BE"));
      expect(countCalls(calls, isToken)).toBe(1);

      advance(1);
      await provider.getAdActivity(query("DE"));
      expect(countCalls(calls, isToken)).toBe(2);
    });
  });
});
