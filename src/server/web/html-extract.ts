import { z } from "zod";
import type { CompetitorObserved } from "@/domain/web";

/** Plain-text reading of an HTML page, with no dependency: enough for excerpts and product facts. */

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", euro: "€", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", ecirc: "ê", ocirc: "ô", icirc: "î", ucirc: "û", acirc: "â", ugrave: "ù", iuml: "ï", euml: "ë" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith("#")) {
      const value = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

export function pageText(html: string): string {
  const text = html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  return joinSplitPrices(decodeEntities(text).replace(/\s+/g, " ").trim());
}

/** Shops style cents apart, so removing tags leaves "10 , 38 €" or "10€38": one price, written once. */
export function joinSplitPrices(text: string): string {
  return text
    .replace(/(\d) ?([,.]) ?(\d{2}) ?([€$£])/g, "$1$2$3 $4")
    .replace(/(\d) ?€ ?(\d{2})(?!\d)/g, "$1,$2 €");
}

const EXCERPT_WINDOW = 320;

/**
 * The passages of a page most likely to answer a search, in page order: pages open with menus, so
 * their first characters say little. Windows holding the search words or figures come first.
 */
export function relevantExcerpt(text: string, query: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const words = query.toLowerCase().split(/\s+/).filter((word) => word.length >= 3);
  const windows: Array<{ readonly index: number; readonly body: string; readonly score: number }> = [];
  let start = 0;
  while (start < text.length) {
    const rough = Math.min(text.length, start + EXCERPT_WINDOW);
    const space = rough === text.length ? rough : text.indexOf(" ", rough);
    const end = space < 0 ? text.length : space;
    const body = text.slice(start, end).trim();
    const lower = body.toLowerCase();
    const score = words.filter((word) => lower.includes(word)).length * 3 + (/\d/.test(body) ? 1 : 0) + (/\d\s?[€$£]|[€$£]\s?\d|%/.test(body) ? 2 : 0);
    windows.push({ index: windows.length, body, score });
    start = end + 1;
  }
  const best = [...windows].sort((a, b) => b.score - a.score || a.index - b.index);
  const kept: typeof windows = [];
  let used = 0;
  for (const window of best) {
    if (used + window.body.length > maxChars) continue;
    kept.push(window);
    used += window.body.length + 3;
  }
  return kept.sort((a, b) => a.index - b.index).map((window) => window.body).join(" … ");
}

export function pageTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = match?.[1] ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : "";
  return title || null;
}

/** Content of a <meta property|name="key" content="..."> tag, in either attribute order. */
export function metaContent(html: string, key: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (name?.toLowerCase() !== key.toLowerCase()) continue;
    const content = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? /\bcontent\s*=\s*'([^']*)'/i.exec(tag)?.[1];
    if (content) return decodeEntities(content).trim();
  }
  return null;
}

const numberish = z.preprocess((v) => (typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : v), z.number().finite());

export interface JsonLdProduct {
  readonly name: string | null;
  readonly brand: string | null;
  readonly image: string | null;
  readonly priceMin: number | null;
  readonly priceMax: number | null;
  readonly currency: string | null;
  readonly reviewCount: number | null;
  readonly rating: number | null;
}

const asRecord = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const num = (v: unknown): number | null => {
  const parsed = numberish.safeParse(v);
  return parsed.success ? parsed.data : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function isProductNode(node: Record<string, unknown>): boolean {
  return asArray(node["@type"]).some((t) => t === "Product" || t === "ProductGroup");
}

function findProductNode(value: unknown): Record<string, unknown> | null {
  for (const item of asArray(value)) {
    const node = asRecord(item);
    if (!node) continue;
    if (isProductNode(node)) return node;
    const nested = findProductNode(node["@graph"]);
    if (nested) return nested;
  }
  return null;
}

/** The schema.org Product of a page, when it publishes one. Malformed blocks are skipped. */
export function jsonLdProduct(html: string): JsonLdProduct | null {
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1] ?? "");
    } catch {
      continue;
    }
    const node = findProductNode(parsed);
    if (!node) continue;
    const offers = [...asArray(node.offers), ...asArray(node.hasVariant).flatMap((v) => asArray(asRecord(v)?.offers))].flatMap((o): Record<string, unknown>[] => {
      const offer = asRecord(o);
      return offer ? [offer, ...asArray(offer.offers).flatMap((x): Record<string, unknown>[] => {
        const nested = asRecord(x);
        return nested ? [nested] : [];
      })] : [];
    });
    const prices = offers.flatMap((o) => [num(o.price), num(o.lowPrice), num(o.highPrice)]).filter((p): p is number => p !== null && p >= 0);
    const currency = offers.map((o) => str(o.priceCurrency)).find(Boolean) ?? null;
    const brand = asRecord(node.brand);
    const rating = asRecord(node.aggregateRating);
    const image = asArray(node.image).map((i) => str(i) ?? str(asRecord(i)?.url)).find(Boolean) ?? null;
    return {
      name: str(node.name),
      brand: brand ? str(brand.name) : str(node.brand),
      image,
      priceMin: prices.length ? Math.min(...prices) : null,
      priceMax: prices.length ? Math.max(...prices) : null,
      currency,
      reviewCount: rating ? (num(rating.reviewCount) ?? num(rating.ratingCount)) : null,
      rating: rating ? num(rating.ratingValue) : null,
    };
  }
  return null;
}

const attribute = (tag: string, name: string): string | null => new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1] ?? null;

/**
 * Judge.me's counters. The main widget is this product's own; the other tag covers the whole shop. A
 * product's badges in "related products" lists are left out: their numbers belong to other products.
 */
export function reviewWidgets(html: string): { readonly product: { readonly count: number; readonly rating: number | null } | null; readonly shop: { readonly count: number; readonly rating: number | null } | null } {
  const read = (tag: string | undefined, ratingName: string) => {
    if (!tag) return null;
    const count = num(attribute(tag, "data-number-of-reviews"));
    if (count === null) return null;
    const rating = num(attribute(tag, ratingName));
    return { count: Math.trunc(count), rating: count > 0 && rating !== null && rating > 0 ? rating : null };
  };
  return {
    product: read(/<[a-z]+\b[^>]*class\s*=\s*["']jdgm-rev-widg["'][^>]*>/i.exec(html)?.[0], "data-average-rating"),
    shop: read(/<[a-z]+\b[^>]*class\s*=\s*["']jdgm-all-reviews-text__text["'][^>]*>/i.exec(html)?.[0], "data-score"),
  };
}

const EMPTY_OBSERVED: CompetitorObserved = {
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
  compareAtPrice: null,
  productType: null,
  shopRating: null,
  shopReviewCount: null,
  variantRows: [],
};

/** Facts readable from the page itself, for any kind of site. */
export function observeHtml(html: string): CompetitorObserved {
  const ld = jsonLdProduct(html);
  const metaPrice = Number((metaContent(html, "product:price:amount") ?? metaContent(html, "og:price:amount") ?? "").replace(",", "."));
  const price = ld?.priceMin ?? (Number.isFinite(metaPrice) && metaPrice > 0 ? metaPrice : null);
  const reviews = reviewWidgets(html);
  return {
    ...EMPTY_OBSERVED,
    name: ld?.name ?? metaContent(html, "og:title") ?? pageTitle(html),
    vendor: ld?.brand ?? null,
    priceMin: price,
    priceMax: ld?.priceMax ?? price,
    currency: ld?.currency ?? metaContent(html, "product:price:currency") ?? metaContent(html, "og:price:currency") ?? shopifyCurrency(html),
    reviewCount: ld?.reviewCount ?? reviews.product?.count ?? null,
    rating: ld?.rating ?? reviews.product?.rating ?? null,
    shopReviewCount: reviews.shop?.count ?? null,
    shopRating: reviews.shop?.rating ?? null,
    image: ld?.image ?? metaContent(html, "og:image"),
    deliveryText: deliveryText(pageText(html)),
  };
}

/** A page about one product: it says so in its product data, or states a price of its own. */
export function isProductPage(html: string): boolean {
  return jsonLdProduct(html) !== null || /product/i.test(metaContent(html, "og:type") ?? "") || metaContent(html, "product:price:amount") !== null;
}

const PRODUCT_PATH = /\/(?:products?|produits?|productos?|item|p|dp)\/[^/?#]{3,}/i;
const MAX_PRODUCT_LINKS = 8;

/** Product pages of the same site linked from a page, once each. */
export function productLinksIn(html: string, base: URL): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)/gi)) {
    if (!match[1] || !URL.canParse(match[1], base)) continue;
    const link = new URL(match[1], base);
    if (link.origin !== base.origin || !PRODUCT_PATH.test(link.pathname)) continue;
    links.add(`${link.origin}${link.pathname}`);
    if (links.size >= MAX_PRODUCT_LINKS) break;
  }
  return [...links];
}

export function isShopifyPage(html: string): boolean {
  return /cdn\.shopify\.com|\bShopify\.theme\b|myshopify\.com|shopify-digital-wallet/i.test(html);
}

export function shopifyCurrency(html: string): string | null {
  return /Shopify\.currency\s*=\s*\{\s*"active"\s*:\s*"([A-Z]{3})"/.exec(html)?.[1] ?? null;
}

/** Scripts a page loads that reveal an app. Dropshipping tools are told apart: they feed a hypothesis. */
const APP_SIGNATURES: ReadonlyArray<readonly [string, RegExp, boolean]> = [
  ["DSers", /dsers/i, true],
  ["Zendrop", /zendrop/i, true],
  ["CJ Dropshipping", /cjdropshipping/i, true],
  ["Spocket", /spocket/i, true],
  ["AutoDS", /autods/i, true],
  ["Syncee", /syncee/i, true],
  ["Oberlo", /oberlo/i, true],
  ["Loox", /loox\.io/i, false],
  ["Judge.me", /judge\.me/i, false],
  ["Yotpo", /yotpo/i, false],
  ["Klaviyo", /klaviyo/i, false],
  ["Stamped", /stamped\.io/i, false],
  ["AliReviews", /alireviews|fireapps/i, false],
];

export function detectApps(html: string): { readonly apps: readonly string[]; readonly dropship: boolean } {
  const found = APP_SIGNATURES.filter(([, pattern]) => pattern.test(html));
  return { apps: found.map(([name]) => name), dropship: found.some(([, , dropship]) => dropship) };
}

/** First sentence-sized piece of a page that states a delivery time in days, in en, fr or es. */
export function deliveryText(text: string): string | null {
  const match = /[^.!?]{0,60}\b\d{1,2}\s*(?:-|–|à|to|a)\s*\d{1,2}\s*(?:business |working |ouvrés? |hábiles )?(?:days|jours|días)\b[^.!?"]{0,40}/i.exec(text);
  if (!match) return null;
  // The window may open in the middle of a word: start at the next one.
  const cut = match.index > 0 && /\p{L}/u.test(text[match.index - 1] ?? "") ? match[0].replace(/^\S*\s*/, "") : match[0];
  // The same at its end, when the window stops inside a word.
  const end = match.index + match[0].length;
  const whole = end < text.length && /\p{L}/u.test(text[end] ?? "") ? cut.replace(/\s*\S*$/, "") : cut;
  // What came before a dash or a colon belongs to another sentence.
  return whole.replace(/^[^]*\s[-–—:]\s(?=[^]*\d)/, "").trim();
}

/** A delivery of a week or more from the first day is a usual sign of shipping from abroad. */
export function isLongDelivery(text: string | null): boolean {
  const match = text ? /(\d{1,2})\s*(?:-|–|à|to|a)\s*(\d{1,2})\s*(?:business |working |ouvrés? |hábiles )?(?:days|jours|días)/i.exec(text) : null;
  return match ? Number(match[1]) >= 7 && Number(match[2]) <= 60 : false;
}
