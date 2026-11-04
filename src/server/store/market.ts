import "server-only";
import type { ServerEnv } from "@/config/env";
import type { MarketOffer, StoreMarketResult, StoreSnapshot } from "@/domain/store";
import { matchListings } from "@/engine/competitor/entity-match";
import { convert, marketOf } from "@/engine/store/market";
import { summariseStore } from "@/engine/store/summary";
import type { Locale } from "@/i18n/config";
import { createProviderSet } from "@/providers/registry";
import { parseShopifyProduct, shopifyHandleUrl } from "@/server/web/competitor";
import { isProductPage, observeHtml, shopifyCurrency } from "@/server/web/html-extract";
import { createSiteReader, DEFAULT_FETCH_DEPS, type SiteReader } from "@/server/web/safe-fetch";
import { searchWeb, type SearchHit } from "@/server/web/searxng";

/**
 * The owner's best products next to the same products in other shops: a web search by title, then
 * each candidate page read like a competitor's (robots.txt respected, paced). A price is compared only
 * when the match is certain or strong; lookalikes are listed apart. Converted at the ECB rate of the day.
 */

export const MARKET_PRODUCTS = 5;
const HITS_PER_PRODUCT = 8;
const OFFERS_PER_PRODUCT = 4;
const PACE_MS = 800;
const NO_CACHE = { get: async () => null, set: async () => undefined };

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** Pages that look like one product, away from the owner's own domains and from search or review sites. */
export function candidateHits(hits: readonly SearchHit[], own: ReadonlySet<string>): SearchHit[] {
  const seenHosts = new Set<string>();
  return hits.filter((hit) => {
    const host = hostOf(hit.url);
    if (!host || own.has(host) || seenHosts.has(host)) return false;
    if (/(^|\.)(google|bing|youtube|facebook|instagram|tiktok|pinterest|reddit|wikipedia|trustpilot)\./.test(`.${host}`)) return false;
    seenHosts.add(host);
    return true;
  });
}

async function readOffer(hit: SearchHit, site: SiteReader): Promise<Omit<MarketOffer, "converted" | "match"> & { readonly vendor: string | null } | null> {
  const page = await site.read(hit.url, "text/html,*/*;q=0.5");
  if (!page.ok || !page.contentType.includes("html") || !isProductPage(page.body)) return null;
  let observed = observeHtml(page.body);
  const productJs = shopifyHandleUrl(new URL(page.url));
  if (productJs) {
    const js = await site.read(productJs, "application/json,*/*;q=0.5");
    const parsed = js.ok ? parseShopifyProduct(js.body) : null;
    if (parsed) observed = { ...observed, ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== null && v !== undefined)) };
  }
  const currency = observed.currency ?? shopifyCurrency(page.body);
  const host = hostOf(page.url);
  if (!host || observed.priceMin === null || !currency || !observed.name) return null;
  return { domain: host, url: page.url, title: observed.name.slice(0, 160), price: observed.priceMin, currency: currency.toUpperCase(), vendor: observed.vendor };
}

export async function readStoreMarket(snapshot: StoreSnapshot, env: ServerEnv, locale: Locale, now: () => number = Date.now): Promise<StoreMarketResult> {
  const summary = summariseStore(snapshot);
  const currency = snapshot.shop.currency.toUpperCase();
  const own = new Set([snapshot.shop.domain, hostOf(snapshot.shop.primaryUrl ?? "") ?? ""].filter(Boolean).map((d) => d.replace(/^www\./, "")));
  // The products that matter most: those that sell, then the active ones.
  const picked = [...summary.products]
    .filter((p) => p.status === "ACTIVE")
    .sort((a, b) => b.revenue - a.revenue || b.units - a.units)
    .slice(0, MARKET_PRODUCTS);
  if (picked.length === 0) return { ok: false, code: "no_store" };

  const fx = await createProviderSet({ env, cache: NO_CACHE }).fx.getEurRates().catch(() => null);
  const rates = fx?.ok ? fx.data.rates : null;
  const site = createSiteReader(DEFAULT_FETCH_DEPS, undefined, PACE_MS);

  const products = [];
  let searchedAny = false;
  for (const product of picked) {
    const query = [product.vendor && !product.title.toLowerCase().includes(product.vendor.toLowerCase()) ? product.vendor : null, product.title].filter(Boolean).join(" ");
    const search = await searchWeb(query, locale, HITS_PER_PRODUCT, env);
    if (!search.ok && search.code === "search_not_installed") return { ok: false, code: "search_not_installed" };
    if (search.ok) searchedAny = true;
    const offers: MarketOffer[] = [];
    for (const hit of search.ok ? candidateHits(search.hits, own) : []) {
      if (offers.length >= OFFERS_PER_PRODUCT) break;
      const offer = await readOffer(hit, site).catch(() => null);
      if (!offer) continue;
      const match = matchListings({ title: product.title, brand: product.vendor, price: product.priceMin }, { title: offer.title, brand: offer.vendor, price: convert(offer.price, offer.currency, currency, rates) });
      if (match.level === "different") continue;
      offers.push({ domain: offer.domain, url: offer.url, title: offer.title, price: offer.price, currency: offer.currency, converted: convert(offer.price, offer.currency, currency, rates), match: match.level });
    }
    products.push(marketOf(product.id, product.title, product.priceMin, offers, search.ok || search.code === "no_results"));
  }
  if (!searchedAny && products.every((p) => p.state === "search_failed")) return { ok: false, code: "search_failed" };
  return { ok: true, market: { currency, products, ratesDate: fx?.ok ? fx.data.date : null, readAt: new Date(now()).toISOString() } };
}
