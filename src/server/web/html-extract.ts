import { z } from "zod";

/** Plain-text reading of an HTML page, with no dependency: enough for excerpts and product facts. */

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", euro: "€" };

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
  const match = /[^.!?]{0,60}\b\d{1,2}\s*(?:-|–|à|to|a)\s*\d{1,2}\s*(?:business |working |ouvrés? |hábiles )?(?:days|jours|días)\b[^.!?]{0,40}/i.exec(text);
  if (!match) return null;
  // The window may open in the middle of a word: start at the next one.
  const cut = match.index > 0 && /\p{L}/u.test(text[match.index - 1] ?? "") ? match[0].replace(/^\S*\s*/, "") : match[0];
  return cut.trim();
}

/** A delivery of a week or more from the first day is a usual sign of shipping from abroad. */
export function isLongDelivery(text: string | null): boolean {
  const match = text ? /(\d{1,2})\s*(?:-|–|à|to|a)\s*(\d{1,2})\s*(?:business |working |ouvrés? |hábiles )?(?:days|jours|días)/i.exec(text) : null;
  return match ? Number(match[1]) >= 7 && Number(match[2]) <= 60 : false;
}
