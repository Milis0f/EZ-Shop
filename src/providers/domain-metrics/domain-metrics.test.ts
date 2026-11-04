import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/config/env";
import { MemoryCacheRepository } from "@/server/repositories/memory-repositories";
import { AHREFS_ATTRIBUTION, AhrefsDomainRatingProvider, ahrefsMeta, parseAhrefs } from "./ahrefs";
import { CruxProvider, cruxMeta, parseCrux } from "./crux";
import { OpenPageRankProvider, openPageRankMeta, parseOpenPageRank } from "./open-pagerank";
import { cacheKey } from "../http";
import { bareDomain } from "./shared";

const query = { domain: "shop.example", origin: "https://www.shop.example" };
const AT = "2026-11-04T00:00:00.000Z";
const env = (values: Partial<ServerEnv>) => values as ServerEnv;

afterEach(() => vi.unstubAllGlobals());

describe("bareDomain", () => {
  it("strips scheme, path and www", () => {
    expect(bareDomain("https://www.Shop.example/products/x")).toBe("shop.example");
    expect(bareDomain("not a domain")).toBeNull();
  });
});

describe("Chrome UX Report", () => {
  it("reads the p75 of each metric and the collection period", () => {
    const body = {
      record: {
        metrics: {
          largest_contentful_paint: { percentiles: { p75: 2400 } },
          interaction_to_next_paint: { percentiles: { p75: 180 } },
          cumulative_layout_shift: { percentiles: { p75: "0.05" } },
        },
        collectionPeriod: { firstDate: { year: 2026, month: 10, day: 5 }, lastDate: { year: 2026, month: 11, day: 1 } },
      },
    };
    const obs = parseCrux(body, cruxMeta, query, "https://developer.chrome.com/docs/crux", AT)!;
    const byMetric = Object.fromEntries(obs.values.map((v) => [v.metric, v]));
    expect(byMetric.crux_presence).toMatchObject({ value: 1, coverage: "available", periodStart: "2026-10-05", periodEnd: "2026-11-01" });
    expect(byMetric.crux_lcp_p75).toMatchObject({ value: 2400, unit: "ms", nature: "published" });
    expect(byMetric.crux_cls_p75.value).toBe(0.05);
  });

  it("turns 'not in the report' into not covered, never into zero", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 404, status: "NOT_FOUND" } }), { status: 404 })));
    const provider = new CruxProvider(env({ CRUX_API_KEY: "AIzaTESTTESTTESTTESTTESTTESTTESTTESTTE" }), new MemoryCacheRepository(), 1000);
    const result = await provider.getDomainMetrics(query);
    expect(result.ok && result.data.values).toEqual([expect.objectContaining({ metric: "crux_presence", value: null, coverage: "not_covered" })]);
  });

  it("sends the key in the query and the origin in the body, never the key in the cache key", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ record: { metrics: {} } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const cache = new MemoryCacheRepository();
    await new CruxProvider(env({ CRUX_API_KEY: "AIzaSECRETSECRETSECRETSECRETSECRETSEC" }), cache, 1000).getDomainMetrics(query);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("key=AIzaSECRET");
    expect(JSON.parse(String(init?.body))).toEqual({ origin: "https://www.shop.example" });
    const keys = [...(cache as unknown as { store: Map<string, unknown> }).store.keys()];
    expect(keys).toEqual([cacheKey("chrome-ux-report", "https://www.shop.example")]);
  });

  it("is not configured without a key and calls nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await new CruxProvider(env({}), new MemoryCacheRepository(), 1000).getDomainMetrics(query);
    expect(result.ok ? null : result.error.code).toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Open PageRank", () => {
  it("reads score, rank and referring domains", () => {
    const obs = parseOpenPageRank({ as_of: "2026-10-01", results: [{ domain: "shop.example", found: true, open_page_rank: 3.4, rank: 812345, referring_domains: 120 }] }, openPageRankMeta, query, AT)!;
    expect(obs.values.map((v) => [v.metric, v.value])).toEqual([
      ["open_page_rank", 3.4],
      ["open_page_rank_position", 812345],
      ["referring_domains", 120],
    ]);
    expect(obs.values[0].periodEnd).toBe("2026-10-01");
  });

  it("calls an unknown domain not covered", () => {
    const obs = parseOpenPageRank({ results: [{ domain: "shop.example", found: false, open_page_rank: null }] }, openPageRankMeta, query, AT)!;
    expect(obs.values.every((v) => v.coverage === "not_covered" && v.value === null)).toBe(true);
  });

  it("posts the bare domain with a bearer key", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await new OpenPageRankProvider(env({ OPEN_PAGERANK_API_KEY: "opr_live_abcdefgh" }), new MemoryCacheRepository(), 1000).getDomainMetrics({ domain: "www.shop.example", origin: "" });
    const init = fetchMock.mock.calls[0][1];
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer opr_live_abcdefgh");
    expect(JSON.parse(String(init?.body))).toEqual({ domains: ["shop.example"], include_history: false });
  });

  it("reports a quota stop as rate limited", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { type: "quota_error" } }), { status: 429 })));
    const result = await new OpenPageRankProvider(env({ OPEN_PAGERANK_API_KEY: "opr_live_abcdefgh" }), new MemoryCacheRepository(), 1000).getDomainMetrics(query);
    expect(result.ok ? null : result.error.code).toBe("rate_limited");
  });
});

describe("Ahrefs Domain Rating", () => {
  it("keeps the rating and the required attribution", () => {
    const obs = parseAhrefs({ domain_rating: { domain_rating: 42.5, license: "https://ahrefs.com/" } }, ahrefsMeta, query, AT)!;
    expect(obs.values[0]).toMatchObject({ metric: "ahrefs_domain_rating", value: 42.5, attribution: AHREFS_ATTRIBUTION });
  });

  it("asks the free endpoint for the bare domain", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ domain_rating: { domain_rating: 10 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new AhrefsDomainRatingProvider(env({ AHREFS_API_KEY: "k" }), new MemoryCacheRepository(), 1000).getDomainMetrics(query);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.ahrefs.com/v3/public/domain-rating-free?target=shop.example&output=json");
    expect(result.ok && result.data.values[0].value).toBe(10);
  });
});
