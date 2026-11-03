import "server-only";
import { z } from "zod";
import type { ShopCatalogue } from "@/domain/web";
import type { SiteReader } from "./safe-fetch";

/**
 * A Shopify shop's public catalogue (`/products.json`, 250 products a page). Everything comes from what
 * the shop publishes: counts of products, prices, dates and stock flags, never sales. A few pages are
 * read, one after the other; when the shop asks to slow down, the pages already read are kept.
 */

const PAGE_SIZE = 250;
/** A catalogue with long descriptions can exceed the reading limit at full size. */
const SMALLER_PAGE_SIZE = 100;
/** At most this many pages: enough to describe a large shop without hammering it. */
export const MAX_CATALOGUE_PAGES = 4;
const TOP_BRANDS = 6;
const TOP_TYPES = 6;
const TOP_TAGS = 10;
const NEWEST = 6;
const WANTED_BANDS = 5;
const USUAL_SHARE = 0.9;
const DAY_MS = 86_400_000;
const RECENT_DAYS = 90;
const MONTHS = 12;
/** Past this share of products changed within a day, the changes come from an app, not from sales. */
const AUTO_UPDATE_SHARE = 0.8;
const AUTO_UPDATE_MIN_PRODUCTS = 20;

const tagsSchema = z.union([z.array(z.string()), z.string()]).nullish();

const productSchema = z.object({
  title: z.string().default(""),
  handle: z.string(),
  vendor: z.string().nullish(),
  product_type: z.string().nullish(),
  tags: tagsSchema,
  published_at: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  variants: z
    .array(
      z.object({
        id: z.union([z.number(), z.string()]).nullish(),
        title: z.string().nullish(),
        price: z.union([z.string(), z.number()]).nullish(),
        compare_at_price: z.union([z.string(), z.number()]).nullish(),
        available: z.boolean().optional(),
      }),
    )
    .default([]),
});
export type CatalogueProduct = z.infer<typeof productSchema>;
const catalogueSchema = z.object({ products: z.array(z.unknown()) });

export const price = (value: string | number | null | undefined): number | null => {
  const parsed = typeof value === "number" ? value : value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const dateOf = (value: string | null | undefined): number | null => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? 0) + upper) / 2;
}

/** Round band widths (10, 20, 50, 100…), so that the bands read as prices. */
function roundStep(rough: number): number {
  const scale = 10 ** Math.floor(Math.log10(rough));
  const unit = [1, 2, 5, 10].find((candidate) => candidate * scale >= rough) ?? 10;
  return unit * scale;
}

export function priceBands(prices: readonly number[]): ShopCatalogue["priceBands"] {
  if (prices.length < 2) return [];
  const sorted = [...prices].sort((a, b) => a - b);
  const low = sorted[0] ?? 0;
  const highest = sorted.at(-1) ?? 0;
  if (low === highest) return [];
  // A few very dear products must not squeeze everything else into one band: the last band takes them.
  const usual = sorted[Math.floor((sorted.length - 1) * USUAL_SHARE)] ?? highest;
  const step = roundStep((usual > low ? usual - low : highest - low) / WANTED_BANDS);
  const first = Math.floor(low / step) * step;
  const count = Math.floor((Math.max(usual, low) - first) / step) + 1;
  return Array.from({ length: count }, (_, i) => {
    const from = first + i * step;
    const last = i === count - 1;
    const to = last ? Math.max(from + step, Math.ceil(highest / step) * step + (highest % step === 0 ? step : 0)) : from + step;
    return { from, to, count: prices.filter((p) => p >= from && p < to).length };
  });
}

/** The products of one catalogue page; null when the answer is not a catalogue. */
export function parseCataloguePage(body: string): CatalogueProduct[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = catalogueSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data.products.flatMap((item) => {
    const product = productSchema.safeParse(item);
    return product.success ? [product.data] : [];
  });
}

export const tagsOf = (product: CatalogueProduct): string[] =>
  (Array.isArray(product.tags) ? product.tags : (product.tags ?? "").split(",")).map((tag) => tag.trim()).filter(Boolean);

/** The lowest price of a product and whether any of its variants is reduced, with by how much. */
export function offerOf(product: CatalogueProduct): { readonly lowest: number | null; readonly discount: number | null; readonly inStock: boolean } {
  const prices = product.variants.map((v) => price(v.price)).filter((p): p is number => p !== null);
  const discounts = product.variants.flatMap((v) => {
    const before = price(v.compare_at_price);
    const now = price(v.price);
    return before !== null && now !== null && before > now ? [(before - now) / before] : [];
  });
  return { lowest: prices.length ? Math.min(...prices) : null, discount: discounts.length ? Math.max(...discounts) : null, inStock: product.variants.some((v) => v.available === true) };
}

function top(counts: ReadonlyMap<string, number>, size: number): { name: string; count: number }[] {
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, size);
}

function countBy(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function monthsBack(nowMs: number): string[] {
  const now = new Date(nowMs);
  return Array.from({ length: MONTHS }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1 - i), 1)).toISOString().slice(0, 7));
}

/** The catalogue in figures: prices, brands, types, discounts, stock, launches and updates. */
export function summariseCatalogue(products: readonly CatalogueProduct[], origin: string, nowMs: number, read: { readonly pagesRead: number; readonly capped: boolean }): ShopCatalogue | null {
  if (products.length === 0) return null;
  const rows = products.map((product) => {
    const published = dateOf(product.published_at) !== null ? (product.published_at ?? null) : dateOf(product.created_at) !== null ? (product.created_at ?? null) : null;
    return { product, published, updated: dateOf(product.updated_at), ...offerOf(product) };
  });
  const prices = rows.map((row) => row.lowest).filter((p): p is number => p !== null);
  const dated = rows.filter((row) => row.published !== null).sort((a, b) => (dateOf(b.published) ?? 0) - (dateOf(a.published) ?? 0));
  const discounts = rows.map((row) => row.discount).filter((d): d is number => d !== null);
  const updatedWithin = (days: number) => rows.filter((row) => row.updated !== null && nowMs - row.updated <= days * DAY_MS).length;
  const months = monthsBack(nowMs);
  const launches = countBy(dated.map((row) => (row.published ?? "").slice(0, 7)));
  const updated24h = updatedWithin(1);

  return {
    counted: products.length,
    capped: read.capped,
    pagesRead: read.pagesRead,
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMedian: median(prices),
    priceMax: prices.length ? Math.max(...prices) : null,
    priceBands: priceBands(prices),
    brands: top(countBy(rows.flatMap((row) => (row.product.vendor?.trim() ? [row.product.vendor.trim()] : []))), TOP_BRANDS),
    types: top(countBy(rows.flatMap((row) => (row.product.product_type?.trim() ? [row.product.product_type.trim()] : []))), TOP_TYPES),
    tags: top(countBy(rows.flatMap((row) => tagsOf(row.product))), TOP_TAGS),
    discounted: discounts.length,
    discountAverage: discounts.length ? discounts.reduce((sum, d) => sum + d, 0) / discounts.length : null,
    inStock: rows.filter((row) => row.inStock).length,
    soldOut: rows.filter((row) => row.product.variants.length > 0 && row.product.variants.every((v) => v.available === false)).length,
    addedLast90Days: dated.filter((row) => nowMs - (dateOf(row.published) ?? 0) <= RECENT_DAYS * DAY_MS).length,
    launchesByMonth: months.map((month) => ({ month, count: launches.get(month) ?? 0 })),
    updated24h,
    updated7d: updatedWithin(7),
    autoUpdated: products.length >= AUTO_UPDATE_MIN_PRODUCTS && updated24h / products.length >= AUTO_UPDATE_SHARE,
    oldestPublishedAt: dated.at(-1)?.published ?? null,
    newest: dated.slice(0, NEWEST).map((row) => ({ title: row.product.title, url: `${origin}/products/${encodeURIComponent(row.product.handle)}`, price: row.lowest, publishedAt: row.published })),
  };
}

/** One page, for tests and for callers with a single answer in hand. */
export function parseCatalogue(body: string, origin: string, nowMs: number, pageSize: number = PAGE_SIZE): ShopCatalogue | null {
  const products = parseCataloguePage(body);
  return products ? summariseCatalogue(products, origin, nowMs, { pagesRead: 1, capped: products.length >= pageSize }) : null;
}

export interface CatalogueRead {
  readonly catalogue: ShopCatalogue | null;
  readonly products: readonly CatalogueProduct[];
  /** read: every page asked for came back; partial: the shop stopped answering after some pages. */
  readonly state: "read" | "partial" | "refused" | "limited" | "absent";
}

/**
 * Reads up to `maxPages` pages, stopping at the first short page. Null catalogue when the shop keeps it
 * private or forbids reading it: nothing is guessed then.
 */
export async function readCatalogue(origin: string, site: SiteReader, nowMs: number, maxPages: number = MAX_CATALOGUE_PAGES): Promise<CatalogueRead> {
  const products: CatalogueProduct[] = [];
  let size = PAGE_SIZE;
  let pagesRead = 0;
  let stopped: CatalogueRead["state"] | null = null;
  for (let page = 1; page <= maxPages; page += 1) {
    let answer = await site.read(`${origin}/products.json?limit=${size}&page=${page}`, "application/json,*/*;q=0.5");
    // The smaller page is for a catalogue over the reading limit: from then on, every page is smaller.
    if (!answer.ok && answer.code === "too_large" && size === PAGE_SIZE) {
      size = SMALLER_PAGE_SIZE;
      answer = await site.read(`${origin}/products.json?limit=${size}&page=${page}`, "application/json,*/*;q=0.5");
    }
    if (!answer.ok) {
      stopped = answer.code === "robots" ? "refused" : answer.code === "rate_limited" ? "limited" : "absent";
      break;
    }
    const found = parseCataloguePage(answer.body);
    if (!found) {
      stopped = "absent";
      break;
    }
    products.push(...found);
    pagesRead += 1;
    if (found.length < size) break;
  }
  const more = pagesRead === maxPages && products.length >= pagesRead * size;
  const catalogue = summariseCatalogue(products, origin, nowMs, { pagesRead, capped: more || (stopped !== null && pagesRead > 0) });
  if (!catalogue) return { catalogue: null, products: [], state: stopped ?? "absent" };
  return { catalogue, products, state: stopped && pagesRead > 0 ? "partial" : "read" };
}
