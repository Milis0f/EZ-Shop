import "server-only";
import { z } from "zod";
import { SOCIAL_NETWORKS, type BestSeller, type ShopPresence, type ShopProfile } from "@/domain/competitor";
import { offerOf, type CatalogueProduct } from "./shop-catalogue";

/**
 * What a Shopify shop publishes about itself besides its products: its card (`/meta.json`), the order
 * of its "best selling" sort, its collections, and what its pages show (social accounts, theme,
 * languages). Only published facts; nothing here is estimated.
 */

const BEST_SELLERS = 24;
const TOP_COLLECTIONS = 12;

const metaSchema = z.object({
  name: z.string().nullish(),
  city: z.string().nullish(),
  country: z.string().nullish(),
  currency: z.string().nullish(),
  description: z.string().nullish(),
  ships_to_countries: z.array(z.string()).nullish(),
  published_products_count: z.number().nullish(),
  published_collections_count: z.number().nullish(),
  offers_shop_pay_installments: z.boolean().nullish(),
});

const text = (value: string | null | undefined): string | null => (value?.trim() ? value.trim() : null);

export function parseShopProfile(body: string): ShopProfile | null {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = metaSchema.safeParse(raw);
  if (!parsed.success) return null;
  const m = parsed.data;
  // A card without a name nor a product count is not Shopify's.
  if (!m.name && typeof m.published_products_count !== "number") return null;
  return {
    name: text(m.name),
    city: text(m.city),
    country: m.country && /^[A-Z]{2}$/.test(m.country) ? m.country : null,
    currency: m.currency && /^[A-Z]{3}$/.test(m.currency) ? m.currency : null,
    description: text(m.description)?.slice(0, 400) ?? null,
    shipsTo: (m.ships_to_countries ?? []).filter((code) => /^[A-Z]{2}$/.test(code)).sort(),
    productCount: typeof m.published_products_count === "number" ? Math.trunc(m.published_products_count) : null,
    collectionCount: typeof m.published_collections_count === "number" ? Math.trunc(m.published_collections_count) : null,
    installments: m.offers_shop_pay_installments ?? null,
  };
}

/** The main part of a page: menus and footers link to products in their own order. */
function mainPart(html: string): string {
  const start = html.search(/<main\b/i);
  if (start < 0) return html;
  const end = html.indexOf("</main>", start);
  return html.slice(start, end > start ? end : undefined);
}

/** Product handles in the order the page lists them, once each. */
export function productHandlesInOrder(html: string, limit: number = BEST_SELLERS): string[] {
  const handles: string[] = [];
  for (const match of mainPart(html).matchAll(/href\s*=\s*["'](?:https?:\/\/[^/"']+)?(?:\/[a-z]{2}(?:-[a-z]{2})?)?(?:\/collections\/[^/"']+)?\/products\/([^/?#"']+)/gi)) {
    const handle = decodeURIComponent(match[1] ?? "").toLowerCase();
    if (handle && !handles.includes(handle)) handles.push(handle);
    if (handles.length >= limit) break;
  }
  return handles;
}

/** The best sellers, named and priced from the catalogue when it holds them, the handle otherwise. */
export function bestSellersOf(handles: readonly string[], products: readonly CatalogueProduct[], origin: string, checkedHandle: string | null): BestSeller[] {
  const byHandle = new Map(products.map((product) => [product.handle.toLowerCase(), product]));
  return handles.map((handle, i) => {
    const product = byHandle.get(handle);
    const offer = product ? offerOf(product) : null;
    return {
      rank: i + 1,
      title: product?.title ?? handle,
      url: `${origin}/products/${encodeURIComponent(handle)}`,
      price: offer?.lowest ?? null,
      available: offer ? offer.inStock : null,
      checked: checkedHandle !== null && handle === checkedHandle.toLowerCase(),
    };
  });
}

const collectionsSchema = z.object({ collections: z.array(z.object({ title: z.string(), handle: z.string().nullish(), products_count: z.number().nullish() })) });

export function parseCollections(body: string): ShopPresence["collections"] {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return [];
  }
  const parsed = collectionsSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.collections
    .filter((c) => c.handle !== "all" && c.handle !== "frontpage" && c.title.trim())
    .map((c) => ({ title: c.title.trim(), count: typeof c.products_count === "number" ? c.products_count : null }))
    .sort((a, b) => (b.count ?? -1) - (a.count ?? -1))
    .slice(0, TOP_COLLECTIONS);
}

/** Names shops give the collection of their best sellers, in en, fr and es. */
const BEST_COLLECTION = /best[-_ ]?sell|top[-_ ]?sell|top[-_ ]?ventes?|meilleures?[-_ ]?ventes?|m[aá]s[-_ ]?vendid/i;

/** The shop's own best-sellers collection, when it has one: its handle and title. */
export function bestSellerCollection(body: string): { readonly handle: string; readonly title: string } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = collectionsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const found = parsed.data.collections.find((c) => (c.handle && BEST_COLLECTION.test(c.handle)) || BEST_COLLECTION.test(c.title));
  return found?.handle ? { handle: found.handle, title: found.title.trim() } : null;
}

const SOCIAL: Readonly<Record<(typeof SOCIAL_NETWORKS)[number], RegExp>> = {
  instagram: /^https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?$/,
  tiktok: /^https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.]+\/?$/,
  facebook: /^https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!sharer|share|dialog|plugins|tr\b)[^?#"']+$/,
  youtube: /^https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)[^?#"']+$/,
  pinterest: /^https?:\/\/(?:[a-z]{2}\.|www\.)?pinterest\.[a-z.]+\/(?!pin\/create)[A-Za-z0-9_]+\/?$/,
  x: /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!intent|share|home)[A-Za-z0-9_]+\/?$/,
  snapchat: /^https?:\/\/(?:www\.)?snapchat\.com\/add\/[A-Za-z0-9_.-]+\/?$/,
};

const themeSchema = z.object({ name: z.string().nullish(), schema_name: z.string().nullish(), schema_version: z.string().nullish() });

export function presenceOf(html: string, collections: ShopPresence["collections"]): ShopPresence {
  const social: ShopPresence["social"] = [];
  for (const match of html.matchAll(/href\s*=\s*["'](https?:\/\/[^"'\s]+)["']/gi)) {
    const url = (match[1] ?? "").replace(/&amp;/g, "&");
    const network = SOCIAL_NETWORKS.find((name) => SOCIAL[name].test(url));
    if (network && !social.some((s) => s.network === network)) social.push({ network, url });
  }
  let theme: ShopPresence["theme"] = null;
  const themeJson = /Shopify\.theme\s*=\s*(\{[^;<]*?\})\s*;/.exec(html)?.[1];
  if (themeJson) {
    try {
      const parsed = themeSchema.safeParse(JSON.parse(themeJson));
      if (parsed.success) theme = { name: text(parsed.data.name), schema: text(parsed.data.schema_name), version: text(parsed.data.schema_version) };
    } catch {
      theme = null;
    }
  }
  const languages = [...new Set([...html.matchAll(/hreflang\s*=\s*["']([a-z]{2})(?:-[A-Za-z]{2})?["']/gi)].map((m) => (m[1] ?? "").toLowerCase()))].sort();
  return { social, theme, languages, collections };
}
