import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/config/env";
import { MemoryCacheRepository } from "@/server/repositories/memory-repositories";
import { GoogleAdsKeywordPlannerProvider } from "./google-ads/adapter";
import { ok } from "./contracts";
import { cached, httpJson, httpText } from "./http";
import { MetaAdLibraryProvider } from "./meta-ad-library/adapter";
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
    expect(result).toMatchObject({ ok: false, error: { code: "upstream_error" } });
  });
});
