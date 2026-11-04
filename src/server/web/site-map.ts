import type { SiteMap } from "@/domain/competitor";
import type { SiteReader } from "./safe-fetch";

/**
 * What a shop declares about its own pages: the sitemaps named in its robots.txt (or the usual
 * `/sitemap.xml`), how many addresses they list, how many are product pages, and the latest change
 * date they state. Declared by the site, not checked page by page; a sitemap may be incomplete.
 */

/** Child sitemaps read at most, product ones first: each is one more request to the shop. */
export const MAX_CHILD_SITEMAPS = 4;
const XML = "application/xml,text/xml,*/*;q=0.5";

export function sitemapsInRobots(robots: string): string[] {
  return [...robots.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]).filter((u) => /^https?:\/\//i.test(u));
}

const decodeXml = (value: string): string => value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

export interface ParsedSitemap {
  readonly kind: "index" | "urlset" | "other";
  readonly locs: readonly string[];
  readonly lastModified: string | null;
}

export function parseSitemap(xml: string): ParsedSitemap {
  const kind = /<sitemapindex[\s>]/i.test(xml) ? "index" : /<urlset[\s>]/i.test(xml) ? "urlset" : "other";
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => decodeXml(m[1]));
  const dates = [...xml.matchAll(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/gi)].map((m) => Date.parse(m[1])).filter((d) => Number.isFinite(d));
  return { kind, locs, lastModified: dates.length ? new Date(Math.max(...dates)).toISOString() : null };
}

const isProductSitemap = (url: string): boolean => /product/i.test(url);
const isProductUrl = (url: string): boolean => /\/products?\//i.test(url);

export async function readSiteMap(origin: string, site: SiteReader): Promise<SiteMap | null> {
  const robots = await site.read(`${origin}/robots.txt`, "text/plain,*/*;q=0.5");
  const named = robots.ok ? sitemapsInRobots(robots.body).filter((u) => u.startsWith(origin)) : [];
  const roots = named.length ? named.slice(0, 2) : [`${origin}/sitemap.xml`];
  let urls = 0;
  let productUrls = 0;
  let childrenListed = 0;
  let childrenRead = 0;
  let lastModified: string | null = null;
  let found = false;
  const later = (date: string | null): void => {
    if (date && (!lastModified || date > lastModified)) lastModified = date;
  };
  for (const root of roots) {
    const answer = await site.read(root, XML);
    if (!answer.ok) continue;
    const parsed = parseSitemap(answer.body);
    if (parsed.kind === "other") continue;
    found = true;
    later(parsed.lastModified);
    if (parsed.kind === "urlset") {
      urls += parsed.locs.length;
      productUrls += parsed.locs.filter(isProductUrl).length;
      continue;
    }
    childrenListed += parsed.locs.length;
    const children = [...parsed.locs].sort((a, b) => Number(isProductSitemap(b)) - Number(isProductSitemap(a))).slice(0, MAX_CHILD_SITEMAPS - childrenRead);
    for (const child of children) {
      const page = await site.read(child, XML);
      childrenRead += 1;
      if (!page.ok) continue;
      const sub = parseSitemap(page.body);
      later(sub.lastModified);
      urls += sub.locs.length;
      productUrls += isProductSitemap(child) ? sub.locs.length : sub.locs.filter(isProductUrl).length;
    }
  }
  if (!found) return null;
  return { robotsFound: robots.ok, sitemaps: roots, urls, productUrls, lastModified, complete: childrenRead >= childrenListed };
}
