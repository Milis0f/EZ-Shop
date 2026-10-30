import "server-only";
import { z } from "zod";
import { getEnv, type ServerEnv } from "@/config/env";
import type { CompetitorObserved, CompetitorResponse, SignalCode, WebSource } from "@/domain/web";
import type { Locale } from "@/i18n/config";
import { readWithAi, type ReadingDeps } from "./ai-reading";
import { deliveryText, detectApps, isLongDelivery, isShopifyPage, jsonLdProduct, metaContent, pageText, pageTitle, shopifyCurrency } from "./html-extract";
import { DEFAULT_FETCH_DEPS, fetchRespectingRobots, type FetchDeps } from "./safe-fetch";
import { searchWeb, type SearchDeps } from "./searxng";

/**
 * Reads a competitor's public product page. Only what the page publishes is reported. Sales are never
 * estimated. A supplier found by search is a hypothesis: it looks like the same product, nothing more.
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
/** Below this share of the product name's words, a listing is about something else. */
const MIN_NAME_OVERLAP = 0.5;

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
  variants: z.array(z.object({ available: z.boolean().optional() })).default([]),
});

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
  };
}

const EMPTY: CompetitorObserved = {
  name: null,
  vendor: null,
  priceMin: null,
  priceMax: null,
  currency: null,
  variants: null,
  variantsInStock: null,
  publishedAt: null,
  reviewCount: null,
  rating: null,
  image: null,
  deliveryText: null,
};

/** Facts readable from the page itself, for any kind of site. */
export function observeHtml(html: string): CompetitorObserved {
  const ld = jsonLdProduct(html);
  const metaPrice = Number((metaContent(html, "product:price:amount") ?? metaContent(html, "og:price:amount") ?? "").replace(",", "."));
  const price = ld?.priceMin ?? (Number.isFinite(metaPrice) && metaPrice > 0 ? metaPrice : null);
  return {
    ...EMPTY,
    name: ld?.name ?? metaContent(html, "og:title") ?? pageTitle(html),
    vendor: ld?.brand ?? null,
    priceMin: price,
    priceMax: ld?.priceMax ?? price,
    currency: ld?.currency ?? metaContent(html, "product:price:currency") ?? metaContent(html, "og:price:currency") ?? shopifyCurrency(html),
    reviewCount: ld?.reviewCount ?? null,
    rating: ld?.rating ?? null,
    image: ld?.image ?? metaContent(html, "og:image"),
    deliveryText: deliveryText(pageText(html)),
  };
}

function withoutNulls<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null)) as Partial<T>;
}

function factsForAi(domain: string, platform: string, observed: CompetitorObserved, apps: readonly string[], suppliers: readonly WebSource[] | null): string {
  const facts = Object.entries(withoutNulls(observed))
    .filter(([key]) => key !== "image")
    .map(([key, value]) => `${key}: ${String(value)}`);
  return [
    `domain: ${domain}`,
    `platform: ${platform}`,
    ...facts,
    apps.length ? `apps detected: ${apps.join(", ")}` : "",
    ...(suppliers ?? []).map((s) => `possible same product on a marketplace (hypothesis): ${s.title}`),
  ]
    .filter(Boolean)
    .join("\n");
}

export interface CompetitorDeps {
  readonly env: ServerEnv;
  readonly fetch: FetchDeps;
  readonly search?: SearchDeps;
  readonly reading?: ReadingDeps;
  readonly now: () => number;
}

const defaultDeps = (): CompetitorDeps => ({ env: getEnv(), fetch: DEFAULT_FETCH_DEPS, now: () => Date.now() });

type SupplierSearch = Extract<CompetitorResponse, { status: "ready" }>["supplierSearch"];

export async function analyzeCompetitor(rawUrl: string, searchSupplier: boolean, locale: Locale, overrides: Partial<CompetitorDeps> = {}): Promise<CompetitorResponse> {
  const deps = { ...defaultDeps(), ...overrides };
  const started = deps.now();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  const page = await fetchRespectingRobots(withScheme, deps.fetch, "text/html,*/*;q=0.5");
  if (!page.ok) return { status: "blocked", code: page.code };
  if (!page.contentType.includes("html")) return { status: "blocked", code: "not_a_page" };

  const url = new URL(page.url);
  const domain = url.hostname.replace(/^www\./, "");
  const html = page.body;
  const shopify = isShopifyPage(html);
  let observed = observeHtml(html);

  if (shopify) {
    const productUrl = shopifyHandleUrl(url);
    const product = productUrl ? await fetchRespectingRobots(productUrl, deps.fetch, "application/json,*/*;q=0.5") : null;
    const parsed = product?.ok ? parseShopifyProduct(product.body) : null;
    // The product JSON states stock, dates and all prices; the page keeps what it alone has (reviews, delivery).
    if (parsed) observed = { ...observed, ...withoutNulls(parsed) };
  }

  const { apps, dropship } = detectApps(html);

  let suppliers: WebSource[] | null = null;
  let supplierSearch: SupplierSearch = "not_asked";
  if (searchSupplier && observed.name) {
    const found = await searchWeb(`${observed.name} aliexpress`, locale, 30, deps.env, deps.search);
    if (found.ok) {
      const name = observed.name;
      suppliers = found.hits
        .filter((hit) => isSupplierCandidate(hit, name))
        .slice(0, SUPPLIER_LIMIT)
        .map((hit) => ({ ...hit, read: false }));
      supplierSearch = "done";
    } else {
      supplierSearch = found.code;
    }
  }

  const signals: SignalCode[] = [];
  if (dropship) signals.push("dropship_app");
  if (isLongDelivery(observed.deliveryText)) signals.push("long_delivery");
  if (suppliers?.length) signals.push("marketplace_copy");

  const platform = shopify ? "shopify" : "other";
  const reading = await readWithAi(
    "Describe this competitor's product and offer. Say which facts are observed and which are only hypotheses.",
    factsForAi(domain, platform, observed, apps, suppliers),
    locale,
    deps.reading,
  );

  return {
    status: "ready",
    url: page.url,
    domain,
    platform,
    observed,
    apps: [...apps],
    signals,
    suppliers,
    supplierSearch,
    reading,
    durationMs: Math.round(deps.now() - started),
  };
}
