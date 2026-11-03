import "server-only";
import { z } from "zod";
import { getEnv, type ServerEnv } from "@/config/env";
import { COUNTRIES, COUNTRY_CODES, type CountryCode } from "@/domain/country";
import type { AdLibrary, BestSeller, DomainSignals, SalesEstimate, ShopPresence, ShopProfile, ShopWatch, SourceUse } from "@/domain/competitor";
import type { CompetitorObserved, CompetitorResponse, ShopCatalogue, SignalCode, WebReading, WebSource } from "@/domain/web";
import { estimateSales } from "@/engine/competitor/sales-estimate";
import { asWatchRecord, buildSnapshot, nextWatch } from "@/engine/competitor/watch";
import type { Locale } from "@/i18n/config";
import type { AdActivityObservation, AdActivityQuery, ProviderResult } from "@/providers/contracts";
import { MetaAdLibraryProvider } from "@/providers/meta-ad-library/adapter";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import { readWithAi, type ReadingDeps } from "./ai-reading";
import { readDomainSignals, type DomainSignalDeps, type DomainSignalsRead } from "./domain-signals";
import { detectApps, isLongDelivery, isProductPage, isShopifyPage, observeHtml, productLinksIn } from "./html-extract";
import { createSiteReader, DEFAULT_FETCH_DEPS, type FetchDeps, type FetchResult } from "./safe-fetch";
import { mergeHits, searchWeb, type SearchDeps } from "./searxng";
import { parseCataloguePage, readCatalogue, type CatalogueProduct } from "./shop-catalogue";
import { bestSellerCollection, bestSellersOf, parseCollections, parseShopProfile, presenceOf, productHandlesInOrder } from "./shop-profile";
import { readStorefront } from "./shop-storefront";

/**
 * Reads a competitor in depth: its product page, and for a Shopify shop its card, catalogue, best
 * sellers and collections, then the age and popularity of its domain, its ads and the web for the same
 * product on marketplaces. Facts are reported as published; sales are only estimated from reviews,
 * as a range with its assumptions; a supplier found by search is a hypothesis. Reads of the shop are
 * spaced out, and each source's outcome is listed.
 */

/** One product's page on a supplier marketplace. Category, search and wholesale listing pages prove nothing. */
const SUPPLIER_PAGES: ReadonlyArray<readonly [RegExp, RegExp]> = [
  [/(^|\.)aliexpress\.[a-z.]+$/i, /\/item\/(?:[^/]+\/)?\d+\.html/i],
  [/(^|\.)temu\.com$/i, /-g-\d+\.html/i],
  [/(^|\.)alibaba\.com$/i, /\/product-detail\//i],
  [/(^|\.)1688\.com$/i, /\/offer\/\d+\.html/i],
  [/(^|\.)cjdropshipping\.com$/i, /\/product\//i],
];
const SUPPLIER_LIMIT = 6;
const SUPPLIER_HITS = 30;
const MAX_VARIANT_ROWS = 24;
/** Below this share of the product name's words, a listing is about something else. */
const MIN_NAME_OVERLAP = 0.5;
/** Between two reads of the shop: Shopify answers "too many requests" to quick bursts. */
const SHOP_PACE_MS = 900;
const WATCH_TTL_S = 365 * 24 * 60 * 60;
const AD_LIBRARY_DAYS = 90;
const YOUNG_DOMAIN_DAYS = 180;
const DAY_MS = 86_400_000;

const significantWords = (text: string): string[] =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3);

/** A supplier candidate: a product page on a marketplace whose title shares most of the product's name. */
export function isSupplierCandidate(hit: { readonly url: string; readonly title: string }, productName: string): boolean {
  const url = new URL(hit.url);
  if (!SUPPLIER_PAGES.some(([host, page]) => host.test(url.hostname) && page.test(url.pathname))) return false;
  const wanted = significantWords(productName);
  if (wanted.length === 0) return false;
  const title = new Set(significantWords(hit.title));
  return wanted.filter((word) => title.has(word)).length / wanted.length >= MIN_NAME_OVERLAP;
}

/** Shopify's public product JSON (`/products/<handle>.js`): prices are in cents. */
const shopifyProductSchema = z.object({
  title: z.string().nullish(),
  vendor: z.string().nullish(),
  published_at: z.string().nullish(),
  price_min: z.number().nullish(),
  price_max: z.number().nullish(),
  featured_image: z.string().nullish(),
  type: z.string().nullish(),
  compare_at_price_min: z.number().nullish(),
  variants: z.array(z.object({ title: z.string().nullish(), price: z.number().nullish(), available: z.boolean().optional() })).default([]),
});

export function shopifyHandleOf(url: URL): string | null {
  const handle = /\/products\/([^/?#]+)/.exec(url.pathname)?.[1];
  return handle ? decodeURIComponent(handle) : null;
}

export function shopifyHandleUrl(url: URL): string | null {
  const handle = /\/products\/([^/?#]+)/.exec(url.pathname)?.[1];
  return handle ? `${url.origin}/products/${handle}.js` : null;
}

export function parseShopifyProduct(body: string): Partial<CompetitorObserved> | null {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = shopifyProductSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  const availability = p.variants.filter((v) => v.available !== undefined);
  return {
    name: p.title ?? null,
    vendor: p.vendor ?? null,
    publishedAt: p.published_at ?? null,
    priceMin: typeof p.price_min === "number" ? p.price_min / 100 : null,
    priceMax: typeof p.price_max === "number" ? p.price_max / 100 : null,
    image: p.featured_image ? (p.featured_image.startsWith("//") ? `https:${p.featured_image}` : p.featured_image) : null,
    variants: p.variants.length || null,
    variantsInStock: availability.length ? availability.filter((v) => v.available).length : null,
    productType: p.type?.trim() || null,
    compareAtPrice: typeof p.compare_at_price_min === "number" && p.compare_at_price_min > 0 ? p.compare_at_price_min / 100 : null,
    variantRows: p.variants.slice(0, MAX_VARIANT_ROWS).map((v) => ({ title: v.title ?? "", price: typeof v.price === "number" ? v.price / 100 : null, available: v.available ?? null })),
  };
}

function withoutNulls<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null)) as Partial<T>;
}

const stateOf = (answer: FetchResult | null, found: boolean): SourceUse["state"] => {
  if (!answer) return "skipped";
  if (answer.ok) return found ? "read" : "absent";
  return answer.code === "robots" ? "refused" : answer.code === "rate_limited" ? "limited" : "absent";
};

export interface ReportFacts {
  readonly domain: string;
  readonly platform: string;
  readonly observed: CompetitorObserved;
  readonly catalogue: ShopCatalogue | null;
  readonly profile: ShopProfile | null;
  readonly bestSellers: readonly BestSeller[];
  readonly domainSignals: DomainSignals | null;
  readonly estimates: { readonly product: SalesEstimate | null; readonly shop: SalesEstimate | null };
  readonly apps: readonly string[];
  readonly suppliers: readonly WebSource[] | null;
}

/** As the report shows it: whole past 10, one decimal below, so a small range never reads as zero. */
const shown = (value: number): string => String(value >= 10 ? Math.round(value) : Math.round(value * 10) / 10);

const estimateLine = (label: string, e: SalesEstimate | null): string =>
  e ? `${label} (estimate from ${e.reviews} reviews, assumed review rates 5% to 1%, ${e.confidence} confidence): ${shown(e.perMonth.p10)} to ${shown(e.perMonth.p90)} buyers a month, middle ${shown(e.perMonth.p50)}` : "";

/** Ratings with one decimal, as the report shows them: the AI must not write 4.69 next to a 4.7. */
const RATINGS = new Set(["rating", "shopRating"]);

/** The facts the AI may reword, every number among them; estimates are named as such. */
export function factsForAi(f: ReportFacts): string {
  const facts = Object.entries(withoutNulls(f.observed))
    .filter(([key]) => key !== "image" && key !== "variantRows")
    .map(([key, value]) => `${key}: ${RATINGS.has(key) && typeof value === "number" ? String(Math.round(value * 10) / 10) : String(value)}`);
  const c = f.catalogue;
  const p = f.profile;
  const d = f.domainSignals;
  const checked = f.bestSellers.find((b) => b.checked);
  return [
    `domain: ${f.domain}`,
    `platform: ${f.platform}`,
    ...facts,
    p?.name ? `shop name: ${p.name}` : "",
    p?.country ? `shop country: ${p.country}` : "",
    p?.productCount !== null && p?.productCount !== undefined ? `products published by the shop: ${p.productCount}` : "",
    p?.shipsTo.length ? `countries it ships to: ${p.shipsTo.length}` : "",
    c ? `products read in its catalogue: ${c.counted}` : "",
    c?.priceMedian !== null && c?.priceMedian !== undefined ? `median product price: ${c.priceMedian}` : "",
    c?.brands.length ? `main brands: ${c.brands.map((b) => b.name).join(", ")}` : "",
    c ? `among the ${c.counted} products read, added in the last 90 days: ${c.addedLast90Days}; discounted: ${c.discounted}; sold out: ${c.soldOut}` : "",
    checked ? `this product's rank in the shop's best-selling sort: ${checked.rank}` : "",
    f.bestSellers.length ? `the shop's best sellers: ${f.bestSellers.slice(0, 5).map((b) => b.title).join(", ")}` : "",
    d?.registeredAt ? `domain registered on: ${d.registeredAt.slice(0, 10)}` : "",
    d?.trancoRank ? `rank among the most visited sites (Tranco): ${d.trancoRank}` : d?.outsideTranco ? "not among the million most visited sites (Tranco)" : "",
    estimateLine("this product's sales", f.estimates.product),
    estimateLine("the whole shop's orders", f.estimates.shop),
    f.apps.length ? `apps detected: ${f.apps.join(", ")}` : "",
    ...(f.suppliers ?? []).map((s) => `possible same product on a marketplace (hypothesis): ${s.title}`),
  ]
    .filter(Boolean)
    .join("\n");
}

export interface CompetitorOptions {
  readonly searchSupplier: boolean;
  readonly deep: boolean;
}

export interface CompetitorDeps {
  readonly env: ServerEnv;
  readonly fetch: FetchDeps;
  readonly search?: SearchDeps;
  readonly reading?: ReadingDeps;
  readonly now: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Where shop readings and registry answers are kept between checks; none in tests unless given. */
  readonly cache?: () => Promise<ProviderCacheRepository | null>;
  readonly domain?: Omit<DomainSignalDeps, "cache">;
  readonly adLibrary?: (query: AdActivityQuery) => Promise<ProviderResult<AdActivityObservation> | null>;
  readonly paceMs?: number;
}

async function defaultCache(): Promise<ProviderCacheRepository | null> {
  try {
    const { getRepositories } = await import("@/server/repositories");
    return (await getRepositories()).cache;
  } catch {
    return null;
  }
}

const defaultDeps = (): CompetitorDeps => ({ env: getEnv(), fetch: DEFAULT_FETCH_DEPS, now: () => Date.now(), cache: defaultCache });

type SupplierSearch = Extract<CompetitorResponse, { status: "ready" }>["supplierSearch"];

async function findSuppliers(name: string, locale: Locale, deps: CompetitorDeps): Promise<{ suppliers: WebSource[] | null; state: SupplierSearch }> {
  const found = await searchWeb(`${name} aliexpress`, locale, SUPPLIER_HITS, deps.env, deps.search);
  if (!found.ok) return { suppliers: null, state: found.code };
  const more = await searchWeb(`${name} alibaba`, locale, SUPPLIER_HITS, deps.env, deps.search);
  const suppliers = mergeHits([found.hits, more.ok ? more.hits : []])
    .filter((hit) => isSupplierCandidate(hit, name))
    .slice(0, SUPPLIER_LIMIT)
    .map((hit) => ({ ...hit, read: false }));
  return { suppliers, state: "done" };
}

const isCountry = (code: string | null | undefined): code is CountryCode => typeof code === "string" && (COUNTRY_CODES as readonly string[]).includes(code);

/** The shop's own country when it is in the EU (where Meta shows every ad), else the first EU country it ships to. */
function adCountry(profile: ShopProfile | null): CountryCode | null {
  const candidates = [profile?.country, ...(profile?.shipsTo ?? [])];
  return candidates.find((code): code is CountryCode => isCountry(code) && COUNTRIES[code].isEU) ?? null;
}

async function readAdLibrary(term: string | null, profile: ShopProfile | null, deps: CompetitorDeps): Promise<AdLibrary> {
  const country = adCountry(profile);
  const base = { term, country, activeAds: null, advertisers: null, truncated: false };
  if (!term) return { ...base, state: "failed" };
  if (!country) return { ...base, state: "outside_eu" };
  const since = new Date(deps.now() - AD_LIBRARY_DAYS * DAY_MS).toISOString().slice(0, 10);
  const query = { terms: [term], country, since };
  const ask = deps.adLibrary ?? (async (q: AdActivityQuery) => {
    const provider = new MetaAdLibraryProvider(deps.env, deps.env.PROVIDER_HTTP_TIMEOUT_MS);
    return provider.status().state === "ready" ? provider.getAdActivity(q) : null;
  });
  const result = await ask(query).catch(() => undefined);
  if (result === null) return { ...base, state: "not_configured" };
  if (!result?.ok) return { ...base, state: "failed" };
  return { ...base, state: "done", activeAds: result.data.activeAds, advertisers: result.data.uniqueAdvertisers, truncated: result.data.truncated };
}

interface ShopRead {
  readonly profile: ShopProfile | null;
  readonly catalogue: ShopCatalogue | null;
  readonly products: readonly CatalogueProduct[];
  readonly bestSellers: readonly BestSeller[];
  readonly bestSellersFrom: "sort" | "collection" | null;
  readonly bestCollection: string | null;
  readonly collections: ShopPresence["collections"];
  readonly sources: readonly SourceUse[];
}

const BEST_COLLECTION_SIZE = 24;

/** The Shopify parts, one after the other: the shop sees a slow, steady reader, never a burst. */
async function readShop(origin: string, checkedHandle: string | null, site: ReturnType<typeof createSiteReader>, nowMs: number): Promise<ShopRead> {
  const meta = await site.read(`${origin}/meta.json`, "application/json,*/*;q=0.5");
  const profile = meta.ok ? parseShopProfile(meta.body) : null;
  const catalogueRead = await readCatalogue(origin, site, nowMs);
  const best = await site.read(`${origin}/collections/all?sort_by=best-selling`, "text/html,*/*;q=0.5");
  let handles = best.ok ? productHandlesInOrder(best.body) : [];
  const collectionsPage = await site.read(`${origin}/collections.json?limit=250`, "application/json,*/*;q=0.5");
  const collections = collectionsPage.ok ? parseCollections(collectionsPage.body) : [];
  // Shopify's own robots.txt forbids the sorted pages: the shop's best-sellers collection, if it has one, is read instead.
  const bestCollection = handles.length === 0 && collectionsPage.ok ? bestSellerCollection(collectionsPage.body) : null;
  let products = catalogueRead.products;
  if (bestCollection) {
    const listed = await site.read(`${origin}/collections/${encodeURIComponent(bestCollection.handle)}/products.json?limit=${BEST_COLLECTION_SIZE}`, "application/json,*/*;q=0.5");
    const found = listed.ok ? (parseCataloguePage(listed.body) ?? []) : [];
    handles = found.map((product) => product.handle.toLowerCase());
    const known = new Set(products.map((product) => product.handle.toLowerCase()));
    products = [...products, ...found.filter((product) => !known.has(product.handle.toLowerCase()))];
  }
  const from = handles.length === 0 ? null : bestCollection ? "collection" : "sort";
  return {
    profile,
    catalogue: catalogueRead.catalogue,
    products: catalogueRead.products,
    bestSellers: bestSellersOf(handles, products, origin, checkedHandle),
    bestSellersFrom: from,
    bestCollection: from === "collection" ? (bestCollection?.title ?? null) : null,
    collections,
    sources: [
      { id: "profile", state: stateOf(meta, profile !== null) },
      { id: "catalogue", state: catalogueRead.state },
      { id: "best_sellers", state: from === "collection" ? "partial" : stateOf(best, handles.length > 0) },
      { id: "collections", state: stateOf(collectionsPage, collections.length > 0) },
    ],
  };
}

async function updateWatch(domain: string, origin: string, products: readonly CatalogueProduct[], nowMs: number, cache: ProviderCacheRepository | null): Promise<ShopWatch | null> {
  if (!cache || products.length === 0) return null;
  const key = `competitor-watch:${domain}`;
  try {
    const record = asWatchRecord(await cache.get(key));
    const next = nextWatch(record, buildSnapshot(products, new Date(nowMs).toISOString()), origin);
    await cache.set(key, "competitor-watch", next.record, WATCH_TTL_S);
    return next.watch;
  } catch (error: unknown) {
    console.error("[competitor] watch not kept", error instanceof Error ? error.name : typeof error);
    return null;
  }
}

function estimatesOf(observed: CompetitorObserved, catalogue: ShopCatalogue | null, signals: DomainSignals | null, dropship: boolean, nowMs: number): ReportFacts["estimates"] {
  return {
    product: estimateSales({
      basis: "product",
      reviews: observed.reviewCount,
      ages: [{ from: "product_published", at: observed.publishedAt }],
      price: observed.priceMin,
      priceAssumed: false,
      currency: observed.currency,
      importedReviewsPossible: dropship,
      nowMs,
    }),
    shop: estimateSales({
      basis: "shop",
      reviews: observed.shopReviewCount,
      ages: [
        { from: "domain_registered", at: signals?.registeredAt ?? null },
        { from: "first_archived", at: signals?.firstArchivedAt ?? null },
        { from: "oldest_product", at: catalogue?.oldestPublishedAt ?? null },
      ],
      price: catalogue?.priceMedian ?? null,
      priceAssumed: true,
      currency: observed.currency,
      importedReviewsPossible: dropship,
      nowMs,
    }),
  };
}

function domainSources(read: DomainSignalsRead | null, deep: boolean): SourceUse[] {
  if (!deep || !read) return (["rdap", "archive", "tranco"] as const).map((id) => ({ id, state: "skipped" as const }));
  const state = (part: "read" | "absent" | "failed"): SourceUse["state"] => (part === "failed" ? "limited" : part);
  return [
    { id: "rdap", state: state(read.parts.rdap) },
    { id: "archive", state: state(read.parts.archive) },
    { id: "tranco", state: state(read.parts.tranco) },
  ];
}

export async function analyzeCompetitor(rawUrl: string, options: CompetitorOptions, locale: Locale, overrides: Partial<CompetitorDeps> = {}): Promise<CompetitorResponse> {
  const deps = { ...defaultDeps(), ...overrides };
  const started = deps.now();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  const site = createSiteReader(deps.fetch, deps.sleep, deps.paceMs ?? SHOP_PACE_MS);
  const page = await site.read(withScheme, "text/html,*/*;q=0.5");
  if (!page.ok) return { status: "blocked", code: page.code };
  if (!page.contentType.includes("html")) return { status: "blocked", code: "not_a_page" };

  const url = new URL(page.url);
  const domain = url.hostname.replace(/^www\./, "");
  const html = page.body;
  const shopify = isShopifyPage(html);
  const cache = deps.cache ? await deps.cache() : null;
  // Registries are other sites: they are asked while the shop is read.
  const domainPending = options.deep ? readDomainSignals(domain, { fetch: deps.domain?.fetch ?? ((input, init) => fetch(input, init)), cache }).catch(() => null) : Promise.resolve(null);
  let observed = observeHtml(html);

  let parsedProduct: Partial<CompetitorObserved> | null = null;
  let productAnswer: FetchResult | null = null;
  if (shopify) {
    const productUrl = shopifyHandleUrl(url);
    productAnswer = productUrl ? await site.read(productUrl, "application/json,*/*;q=0.5") : null;
    parsedProduct = productAnswer?.ok ? parseShopifyProduct(productAnswer.body) : null;
    // The product JSON states stock, dates and all prices; the page keeps what it alone has (reviews, delivery).
    if (parsedProduct) observed = { ...observed, ...withoutNulls(parsedProduct) };
  }

  const pageKind = parsedProduct !== null || isProductPage(html) ? "product" : "not_product";
  // A home page's title is the shop's name, not a product's: nothing of it may read as one.
  if (pageKind === "not_product") observed = { ...observed, name: null, image: null, priceMin: null, priceMax: null, reviewCount: null, rating: null, deliveryText: null };
  const checkedHandle = pageKind === "product" ? shopifyHandleOf(url) : null;
  const shop = shopify ? await readShop(url.origin, checkedHandle, site, deps.now()) : null;
  const catalogue = shop?.catalogue ?? null;
  if (!observed.currency && shop?.profile?.currency) observed = { ...observed, currency: shop.profile.currency };
  const productLinks = pageKind === "not_product" && !catalogue ? productLinksIn(html, url) : [];
  const presence = presenceOf(html, shop?.collections ?? []);

  const { apps, dropship } = detectApps(html);
  const supplierWanted = (options.searchSupplier || options.deep) && observed.name !== null;
  const shopName = shop?.profile?.name ?? null;
  // The official API, after the shop's pages: same origin, so it waits its turn rather than running alongside.
  const storefront = shopify && options.deep ? await readStorefront(url.origin, checkedHandle, deps.fetch, deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))), deps.paceMs ?? SHOP_PACE_MS).catch(() => null) : null;
  const [supplierFound, domainRead, adLibrary] = await Promise.all([
    supplierWanted && observed.name ? findSuppliers(observed.name, locale, deps) : Promise.resolve({ suppliers: null, state: "not_asked" as SupplierSearch }),
    domainPending,
    options.deep && shopify ? readAdLibrary(shopName, shop?.profile ?? null, deps) : Promise.resolve(null),
  ]);
  const domainSignals = domainRead?.signals ?? null;
  const { suppliers, state: supplierSearch } = supplierFound;

  const signals: SignalCode[] = [];
  if (dropship) signals.push("dropship_app");
  if (isLongDelivery(observed.deliveryText)) signals.push("long_delivery");
  if (suppliers?.length) signals.push("marketplace_copy");
  if (catalogue?.autoUpdated) signals.push("price_sync");
  const since = domainSignals?.registeredAt ?? domainSignals?.firstArchivedAt;
  if (since && deps.now() - Date.parse(since) < YOUNG_DOMAIN_DAYS * DAY_MS) signals.push("young_domain");

  const estimates = estimatesOf(observed, catalogue, domainSignals, dropship, deps.now());
  const watch = await updateWatch(domain, url.origin, shop?.products ?? [], deps.now(), cache);

  const platform = shopify ? "shopify" : "other";
  const facts: ReportFacts = { domain, platform, observed, catalogue, profile: shop?.profile ?? null, bestSellers: shop?.bestSellers ?? [], domainSignals, estimates, apps, suppliers };
  // A page with no product and no catalogue has nothing to say: the AI would only reword the emptiness.
  const reading: WebReading =
    pageKind === "not_product" && !catalogue
      ? { summary: null, note: null }
      : await readWithAi(
          pageKind === "product"
            ? "In one sentence: what this product is, how its shop stands (size, age, best sellers) and what stands out in its offer. Mark any deduction as a hypothesis and an estimate as an estimate."
            : "In one sentence: what this shop sells, at what price level and how established it looks. Mark any deduction as a hypothesis and an estimate as an estimate.",
          factsForAi(facts),
          locale,
          deps.reading,
        );

  const sources: SourceUse[] = [
    { id: "page", state: "read" },
    { id: "product", state: shopify && pageKind === "product" ? stateOf(productAnswer, parsedProduct !== null) : "skipped" },
    ...(shop?.sources ?? (["profile", "catalogue", "best_sellers", "collections"] as const).map((id) => ({ id, state: "skipped" as const }))),
    { id: "storefront", state: !shopify || !options.deep ? "skipped" : storefront ? "read" : "absent" },
    ...domainSources(domainRead, options.deep),
    { id: "ad_library", state: adLibrary === null ? "skipped" : adLibrary.state === "done" ? "read" : adLibrary.state === "failed" ? "limited" : "skipped" },
    { id: "suppliers", state: supplierSearch === "done" ? (suppliers?.length ? "read" : "absent") : supplierSearch === "not_asked" ? "skipped" : "limited" },
  ];

  return {
    status: "ready",
    url: page.url,
    domain,
    platform,
    pageKind,
    observed,
    catalogue,
    productLinks,
    limited: site.wasLimited(),
    apps: [...apps],
    signals,
    suppliers,
    supplierSearch,
    reading,
    durationMs: Math.round(deps.now() - started),
    profile: shop?.profile ?? null,
    bestSellers: [...(shop?.bestSellers ?? [])],
    bestSellersFrom: shop?.bestSellersFrom ?? null,
    bestCollection: shop?.bestCollection ?? null,
    domainSignals,
    presence,
    adLibrary,
    estimates,
    watch,
    storefront,
    sources,
  };
}
