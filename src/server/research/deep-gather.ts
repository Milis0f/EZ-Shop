import "server-only";
import type { DeepPrice, DeepShop, DeepSource } from "@/domain/deep-research";
import type { Locale } from "@/i18n/config";
import type { ServerEnv } from "@/config/env";
import { createLimiter } from "@/providers/http";
import { isSupplierCandidate } from "@/server/web/competitor";
import { isShopifyPage, observeHtml, pageText, pageTitle, relevantExcerpt } from "@/server/web/html-extract";
import { createSiteReader, fetchRespectingRobots, type FetchDeps } from "@/server/web/safe-fetch";
import { mergeHits, searchWeb, type SearchDeps, type SearchHit } from "@/server/web/searxng";
import { offerOf, price as priceOf, readCatalogue, type CatalogueProduct } from "@/server/web/shop-catalogue";
import { parseShopProfile } from "@/server/web/shop-profile";

/**
 * What the app gathers on its own before the AI digs further: several searches, the pages worth
 * reading, the Shopify shops met there and the marketplace listings of the same product. Every page
 * read goes through the same SSRF-safe reader, respects robots.txt, and gets a number the report cites.
 */

const HITS_PER_SEARCH = 10;
const PAGES_TO_READ = 8;
const PAGES_TO_TRY = 12;
const PER_DOMAIN = 2;
const CONCURRENT_PAGES = 3;
const MAX_SHOPS = 3;
const MAX_SUPPLIERS = 6;
/** Several pages share the model's context: each keeps its most relevant passages only. */
export const EXCERPT_CHARS = 1_500;
const SHOP_PACE_MS = 900;
/** A short name must match whole ("gourde inox" is not any "inox" product); a longer one, most of its words. */
const MIN_NAME_OVERLAP = 0.6;
const SHORT_NAME_WORDS = 2;

/** What a researcher types after the product's name, per language: its price, what people say, where to buy. */
const ANGLES: Readonly<Record<Locale, readonly string[]>> = {
  en: ["price", "reviews", "buy"],
  fr: ["prix", "avis", "acheter"],
  es: ["precio", "opiniones", "comprar"],
};

const domainOf = (url: string): string => new URL(url).hostname.replace(/^www\./, "");

export const significantWords = (text: string): string[] =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3);

/** Share of the searched name's words a title holds, 0 to 1. */
export function nameOverlap(name: string, title: string): number {
  const wanted = significantWords(name);
  if (wanted.length === 0) return 0;
  const words = new Set(significantWords(title));
  return wanted.filter((word) => words.has(word)).length / wanted.length;
}

/** The numbered sources of a research and what was read of each: the report cites these numbers. */
export class SourceBook {
  private readonly sources: DeepSource[] = [];
  private readonly texts = new Map<number, string>();

  add(url: string, title: string, kind: DeepSource["kind"], options: { readonly read?: boolean; readonly byAi?: boolean } = {}): number {
    const known = this.sources.find((source) => source.url === url);
    if (known) {
      if (options.read && !known.read) this.sources[known.n - 1] = { ...known, read: true };
      return known.n;
    }
    const n = this.sources.length + 1;
    this.sources.push({ n, url, title: title.trim().slice(0, 160) || domainOf(url), domain: domainOf(url), kind, read: options.read === true, byAi: options.byAi === true });
    return n;
  }

  setText(n: number, text: string): void {
    this.texts.set(n, text);
  }

  get(n: number): DeepSource | undefined {
    return this.sources[n - 1];
  }

  text(n: number): string | undefined {
    return this.texts.get(n);
  }

  all(): readonly DeepSource[] {
    return this.sources;
  }
}

export interface GatherDeps {
  readonly env: ServerEnv;
  readonly search?: SearchDeps;
  readonly fetch: FetchDeps;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now: () => number;
}

export type GatherEvent = { readonly step: "search" | "read" | "shops" | "suppliers"; readonly progress: number; readonly detail: string | null };

export interface Gathered {
  readonly prices: DeepPrice[];
  readonly shops: DeepShop[];
  readonly suppliers: number[];
  /** Origins of the Shopify shops met, for the AI's catalogue tool. */
  readonly shopOrigins: ReadonlyMap<number, string>;
}

/** Hits to open first: no more than a few pages from one site, the others wait behind. */
function readingOrder(hits: readonly SearchHit[]): SearchHit[] {
  const perDomain = new Map<string, number>();
  const first: SearchHit[] = [];
  const later: SearchHit[] = [];
  for (const hit of hits) {
    const domain = domainOf(hit.url);
    const seen = perDomain.get(domain) ?? 0;
    perDomain.set(domain, seen + 1);
    (seen < PER_DOMAIN ? first : later).push(hit);
  }
  return [...first, ...later];
}

export interface ReadResult {
  readonly n: number;
  readonly price: DeepPrice | null;
  readonly shopify: boolean;
  readonly origin: string;
}

/** Reads one page into the book: its title, its most relevant passages and the price its product data states. */
export async function readIntoBook(book: SourceBook, url: string, title: string, product: string, fetch: FetchDeps, byAi = false): Promise<ReadResult | null> {
  const page = await fetchRespectingRobots(url, fetch, "text/html,*/*;q=0.5");
  if (!page.ok || !page.contentType.includes("html")) return null;
  const n = book.add(page.url, pageTitle(page.body) ?? title, "page", { read: true, byAi });
  const observed = observeHtml(page.body);
  const price = observed.priceMin !== null && observed.priceMin > 0 ? { source: n, name: observed.name ?? title, price: observed.priceMin, currency: observed.currency, rating: observed.rating, reviewCount: observed.reviewCount } : null;
  const head = price ? `Price in the page's product data: ${price.price} ${price.currency ?? ""}\n` : "";
  book.setText(n, `${head}${relevantExcerpt(pageText(page.body), product, EXCERPT_CHARS)}`);
  return { n, price, shopify: isShopifyPage(page.body), origin: new URL(page.url).origin };
}

/** The product of a shop's catalogue closest to the searched name, with its price and crossed-out price. */
export function closestProduct(products: readonly CatalogueProduct[], name: string, origin: string): DeepShop["match"] {
  let best: { product: CatalogueProduct; overlap: number } | null = null;
  const needed = significantWords(name).length <= SHORT_NAME_WORDS ? 1 : MIN_NAME_OVERLAP;
  for (const product of products) {
    const overlap = nameOverlap(name, product.title);
    if (overlap >= needed && (!best || overlap > best.overlap)) best = { product, overlap };
  }
  if (!best) return null;
  const offer = offerOf(best.product);
  const compare = Math.max(0, ...best.product.variants.map((v) => priceOf(v.compare_at_price) ?? 0));
  return { title: best.product.title, url: `${origin}/products/${encodeURIComponent(best.product.handle)}`, price: offer.lowest, compareAt: compare > (offer.lowest ?? 0) ? compare : null };
}

/** A Shopify shop's card and first catalogue page, read slowly; the closest product is written into the book. */
export async function readShop(book: SourceBook, source: number, origin: string, product: string, deps: GatherDeps): Promise<DeepShop | null> {
  const site = createSiteReader(deps.fetch, deps.sleep, SHOP_PACE_MS);
  const meta = await site.read(`${origin}/meta.json`, "application/json,*/*;q=0.5");
  const profile = meta.ok ? parseShopProfile(meta.body) : null;
  const catalogue = await readCatalogue(origin, site, deps.now(), 1);
  const match = closestProduct(catalogue.products, product, origin);
  if (!profile && !catalogue.catalogue) return null;
  const shop: DeepShop = { source, domain: domainOf(origin), name: profile?.name ?? null, country: profile?.country ?? null, productCount: profile?.productCount ?? catalogue.catalogue?.counted ?? null, match };
  const lines = [
    `Shopify shop ${shop.domain}${shop.name ? ` (${shop.name})` : ""}${shop.country ? `, based in ${shop.country}` : ""}: ${shop.productCount ?? "unknown"} products.`,
    match ? `Its closest product: ${match.title}, price ${match.price ?? "unknown"}${match.compareAt ? `, crossed-out price ${match.compareAt}` : ""}.` : "No product of its first catalogue page matches the name.",
  ];
  book.setText(source, [book.text(source), lines.join(" ")].filter(Boolean).join("\n"));
  return shop;
}

export async function gather(product: string, locale: Locale, book: SourceBook, emit: (event: GatherEvent) => void, deps: GatherDeps): Promise<{ ok: true; gathered: Gathered } | { ok: false; code: "search_not_installed" | "search_failed" | "no_results" }> {
  emit({ step: "search", progress: 0.04, detail: product });
  // The first search alone: it starts the local engine if needed, and its failure is the answer.
  const first = await searchWeb(product, locale, HITS_PER_SEARCH, deps.env, deps.search);
  if (!first.ok) return { ok: false, code: first.code };
  const more = await Promise.all([...ANGLES[locale].map((angle) => `${product} ${angle}`), `${product} aliexpress`].map((query) => searchWeb(query, locale, HITS_PER_SEARCH, deps.env, deps.search)));
  const hits = mergeHits([first.hits, ...more.flatMap((result) => (result.ok ? [result.hits] : []))]);
  emit({ step: "search", progress: 0.14, detail: String(hits.length) });

  const suppliers = hits.filter((hit) => isSupplierCandidate(hit, product)).slice(0, MAX_SUPPLIERS);
  const supplierUrls = new Set(suppliers.map((hit) => hit.url));
  const toRead = readingOrder(hits.filter((hit) => !supplierUrls.has(hit.url))).slice(0, PAGES_TO_TRY);
  const limit = createLimiter(CONCURRENT_PAGES);
  let done = 0;
  const reads = await Promise.all(
    toRead.map((hit) =>
      limit(async () => {
        if (done >= PAGES_TO_READ) return null;
        emit({ step: "read", progress: 0.15 + 0.3 * (done / PAGES_TO_READ), detail: domainOf(hit.url) });
        const result = await readIntoBook(book, hit.url, hit.title, product, deps.fetch);
        if (result) done += 1;
        return result ? { hit, result } : null;
      }),
    ),
  );
  const readHits = reads.filter((entry): entry is { hit: SearchHit; result: ReadResult } => entry !== null);
  const read = readHits.map((entry) => entry.result);
  const readUrls = new Set(readHits.map((entry) => entry.hit.url));
  // Hits not read stay sources by their snippet: the AI may still cite what the search said.
  for (const hit of hits.filter((h) => !supplierUrls.has(h.url) && !readUrls.has(h.url)).slice(0, PAGES_TO_TRY)) {
    const n = book.add(hit.url, hit.title, "search");
    if (!book.text(n) && hit.snippet) book.setText(n, hit.snippet);
  }

  const shopOrigins = new Map<number, string>();
  const shops: DeepShop[] = [];
  for (const page of read.filter((r) => r.shopify)) {
    if ([...shopOrigins.values()].includes(page.origin) || shopOrigins.size >= MAX_SHOPS) continue;
    shopOrigins.set(page.n, page.origin);
    emit({ step: "shops", progress: 0.46 + 0.04 * shops.length, detail: domainOf(page.origin) });
    const shop = await readShop(book, page.n, page.origin, product, deps);
    if (shop) shops.push(shop);
  }

  emit({ step: "suppliers", progress: 0.58, detail: String(suppliers.length) });
  const supplierSources = suppliers.map((hit) => {
    const n = book.add(hit.url, hit.title, "marketplace");
    if (hit.snippet) book.setText(n, `Marketplace listing (not read): ${hit.snippet}`);
    return n;
  });

  return { ok: true, gathered: { prices: read.flatMap((r) => (r.price ? [r.price] : [])), shops, suppliers: supplierSources, shopOrigins } };
}
