import { describe, expect, it } from "vitest";
import type { DomainMetricsProvider } from "@/providers/contracts";
import { fail, ok } from "@/providers/contracts";
import { cruxMeta } from "@/providers/domain-metrics/crux";
import { openPageRankMeta } from "@/providers/domain-metrics/open-pagerank";
import { MemoryCompetitorReadingRepository } from "@/server/repositories/competitor-readings";
import { MemoryCacheRepository } from "@/server/repositories/memory-repositories";
import { sourced } from "@/domain/data-nature";
import { visibilityOf } from "@/engine/competitor/visibility";
import { readVisibility } from "./competitor-extras";
import { observe } from "./observatory";
import type { SiteReader } from "./safe-fetch";
import { parseSitemap, readSiteMap, sitemapsInRobots } from "./site-map";
import { detectTechnologies } from "./technologies";

const reader = (pages: Record<string, string>): SiteReader & { asked: string[] } => {
  const asked: string[] = [];
  return {
    asked,
    read: async (url: string) => {
      asked.push(url);
      const body = pages[url];
      return body === undefined ? { ok: false, code: "http_error" } : { ok: true, url, contentType: "application/xml", body };
    },
    wasLimited: () => false,
  } as unknown as SiteReader & { asked: string[] };
};

describe("sitemaps", () => {
  it("finds the sitemaps named in robots.txt", () => {
    expect(sitemapsInRobots("User-agent: *\nDisallow: /cart\nSitemap: https://s.example/sitemap.xml\nsitemap: /relative.xml")).toEqual(["https://s.example/sitemap.xml"]);
  });

  it("reads an index, its product sitemap first, and counts product pages", async () => {
    const site = reader({
      "https://s.example/robots.txt": "Sitemap: https://s.example/sitemap.xml",
      "https://s.example/sitemap.xml": `<sitemapindex><sitemap><loc>https://s.example/sitemap_pages_1.xml</loc></sitemap><sitemap><loc>https://s.example/sitemap_products_1.xml?from=1&amp;to=9</loc></sitemap></sitemapindex>`,
      "https://s.example/sitemap_products_1.xml?from=1&to=9": `<urlset><url><loc>https://s.example/products/a</loc><lastmod>2026-10-30T10:00:00Z</lastmod></url><url><loc>https://s.example/products/b</loc></url></urlset>`,
      "https://s.example/sitemap_pages_1.xml": `<urlset><url><loc>https://s.example/pages/about</loc><lastmod>2026-09-01</lastmod></url></urlset>`,
    });
    const map = await readSiteMap("https://s.example", site);
    expect(map).toEqual({ robotsFound: true, sitemaps: ["https://s.example/sitemap.xml"], urls: 3, productUrls: 2, lastModified: "2026-10-30T10:00:00.000Z", complete: true });
    expect(site.asked[2]).toContain("sitemap_products");
  });

  it("is null without any sitemap, and never invents one", async () => {
    expect(await readSiteMap("https://s.example", reader({}))).toBeNull();
    expect(parseSitemap("<html></html>").kind).toBe("other");
  });
});

describe("technologies", () => {
  it("names what the page shows, with the evidence", () => {
    const html = `<script src="https://cdn.shopify.com/s/x.js"></script><script src="https://connect.facebook.net/en_US/fbevents.js"></script><script src="https://static.klaviyo.com/onsite.js"></script>`;
    const found = detectTechnologies(html, { server: "cloudflare" });
    expect(found.map((t) => t.name)).toEqual(["Shopify", "Meta Pixel", "Klaviyo", "Cloudflare"]);
    expect(found.find((t) => t.name === "Cloudflare")?.evidence).toBe("header: server");
  });
});

describe("visibility profile", () => {
  const base = { unit: null, sourceUrl: null, observedAt: "2026-11-04T00:00:00Z", periodStart: null, periodEnd: null, attribution: null } as const;

  it("needs two indicators before reading a level, and takes the median", () => {
    const one = visibilityOf([sourced({ ...base, metric: "ahrefs_domain_rating", value: 70, nature: "published", coverage: "available", source: "ahrefs-domain-rating" })], []);
    expect(one.level).toBeNull();
    const three = visibilityOf(
      [
        sourced({ ...base, metric: "ahrefs_domain_rating", value: 70, nature: "published", coverage: "available", source: "a" }),
        sourced({ ...base, metric: "open_page_rank", value: 2, nature: "published", coverage: "available", source: "b" }),
        sourced({ ...base, metric: "crux_presence", value: null, nature: "published", coverage: "not_covered", source: "c" }),
      ],
      [],
    );
    expect(three).toMatchObject({ level: "low", basis: ["ahrefs_domain_rating", "open_page_rank", "crux_presence"] });
  });

  it("names unconfigured sources, calls only ready ones, and keeps a refusal apart", async () => {
    const calls: string[] = [];
    const provider = (meta: DomainMetricsProvider["meta"], ready: boolean, answer: "ok" | "refused"): DomainMetricsProvider => ({
      meta,
      status: () => ({ state: ready ? "ready" : "not_configured", detail: "" }),
      getDomainMetrics: async () => {
        calls.push(meta.id);
        return answer === "ok" ? ok({ values: [], source: { sourceId: meta.id, origin: "live", collectedAt: "", connectorVersion: "0" } }) : fail("unauthorized", "x: HTTP 403");
      },
    });
    const visibility = await readVisibility({ domain: "s.example", origin: "https://s.example" }, null, [provider(cruxMeta, true, "refused"), provider(openPageRankMeta, false, "ok")], () => 0);
    expect(calls).toEqual(["chrome-ux-report"]);
    expect(visibility.notConfigured).toEqual(["open-pagerank"]);
    expect(visibility.indicators).toEqual([expect.objectContaining({ metric: "chrome-ux-report_status", value: null, coverage: "permission_required" })]);
    expect(visibility.level).toBeNull();
  });
});

describe("observatory", () => {
  const snapshot = (at: string, handles: string[]) => ({ at, products: handles.map((handle) => ({ handle, title: handle, variants: [["1", 1, 10] as const] })) });
  const H = 3_600_000;

  it("keeps at most one reading per six hours and builds the history from them", async () => {
    const repo = new MemoryCompetitorReadingRepository();
    const t0 = Date.parse("2026-11-01T00:00:00Z");
    await observe({ domain: "s.example", snapshot: snapshot("", ["a", "b"]), complete: true, extra: {}, nowMs: t0 }, repo, null);
    await observe({ domain: "s.example", snapshot: snapshot("", ["a"]), complete: true, extra: {}, nowMs: t0 + H }, repo, null);
    expect((await repo.list("s.example", 10)).length).toBe(1);
    await observe({ domain: "s.example", snapshot: snapshot("", ["a"]), complete: true, extra: {}, nowMs: t0 + 7 * H }, repo, null);
    const history = await observe({ domain: "s.example", snapshot: snapshot("", ["a"]), complete: true, extra: {}, nowMs: t0 + 14 * H }, repo, null);
    expect(history?.readings).toBe(3);
    expect(history?.counts).toMatchObject({ missing: 1, removed: 1 });
  });

  it("keeps the older watch's reading as the first point, without counting removals from it", async () => {
    const repo = new MemoryCompetitorReadingRepository();
    const cache = new MemoryCacheRepository();
    await cache.set("competitor-watch:s.example", "competitor-watch", { firstSeenAt: "2026-10-01T00:00:00Z", readings: 3, baseline: snapshot("2026-10-01T00:00:00.000Z", ["a", "old"]) }, 60);
    const history = await observe({ domain: "s.example", snapshot: snapshot("", ["a"]), complete: true, extra: {}, nowMs: Date.parse("2026-11-01T00:00:00Z") }, repo, cache);
    expect(history).toMatchObject({ readings: 2, firstAt: "2026-10-01T00:00:00.000Z" });
    expect(history?.counts.missing).toBe(1);
    expect(history?.counts.removed).toBe(0);
  });

  it("never stops the report when the database fails", async () => {
    const broken = { latest: async () => { throw new Error("down"); } } as unknown as MemoryCompetitorReadingRepository;
    expect(await observe({ domain: "s.example", snapshot: snapshot("", ["a"]), complete: true, extra: {}, nowMs: 0 }, broken, null)).toBeNull();
  });
});
