import type { ShopChanges, ShopWatch } from "@/domain/competitor";

/**
 * Following a competitor between two checks: each reading keeps, for each product, its sizes or colours
 * with their stock flag and price. Comparing two readings gives observed facts: what sold out, came
 * back, changed price, appeared or left. A size that sold out is at least one sale, or a withdrawal:
 * the report says both.
 */

export const MAX_WATCHED_PRODUCTS = 1000;
const MAX_VARIANTS = 60;
const MOVERS = 5;
/** A reading becomes the new baseline once the baseline is this old, so changes add up over a check session. */
export const BASELINE_MS = 6 * 60 * 60 * 1000;

/** [variant id, in stock (1) or not (0), price]. */
export type WatchedVariant = readonly [string, 0 | 1, number | null];

export interface WatchedProduct {
  readonly handle: string;
  readonly title: string;
  readonly variants: readonly WatchedVariant[];
}

export interface WatchSnapshot {
  readonly at: string;
  readonly products: readonly WatchedProduct[];
}

export interface WatchRecord {
  readonly firstSeenAt: string;
  readonly readings: number;
  readonly baseline: WatchSnapshot;
}

export interface WatchInputProduct {
  readonly handle: string;
  readonly title: string;
  readonly variants: ReadonlyArray<{ readonly id?: string | number | null; readonly available?: boolean; readonly price?: string | number | null }>;
}

const priceOf = (value: string | number | null | undefined): number | null => {
  const parsed = typeof value === "number" ? value : value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

export function buildSnapshot(products: readonly WatchInputProduct[], at: string): WatchSnapshot {
  return {
    at,
    products: products.slice(0, MAX_WATCHED_PRODUCTS).map((product) => ({
      handle: product.handle,
      title: product.title,
      variants: product.variants
        .slice(0, MAX_VARIANTS)
        .flatMap((v, i): WatchedVariant[] => (v.available === undefined ? [] : [[String(v.id ?? i), v.available ? 1 : 0, priceOf(v.price)]])),
    })),
  };
}

export function compareSnapshots(before: WatchSnapshot, after: WatchSnapshot, origin: string): ShopChanges {
  const old = new Map(before.products.map((p) => [p.handle, p]));
  const now = new Set(after.products.map((p) => p.handle));
  let compared = 0;
  let soldOut = 0;
  let restocked = 0;
  let priceUp = 0;
  let priceDown = 0;
  const movers: ShopChanges["movers"] = [];
  for (const product of after.products) {
    const previous = old.get(product.handle);
    if (!previous) continue;
    compared += 1;
    const variants = new Map(previous.variants.map((v) => [v[0], v]));
    let productSoldOut = 0;
    let productUp = false;
    let productDown = false;
    for (const variant of product.variants) {
      const was = variants.get(variant[0]);
      if (!was) continue;
      if (was[1] === 1 && variant[1] === 0) productSoldOut += 1;
      if (was[1] === 0 && variant[1] === 1) restocked += 1;
      if (was[2] !== null && variant[2] !== null && variant[2] > was[2]) productUp = true;
      if (was[2] !== null && variant[2] !== null && variant[2] < was[2]) productDown = true;
    }
    soldOut += productSoldOut;
    if (productUp) priceUp += 1;
    if (productDown) priceDown += 1;
    if (productSoldOut > 0) movers.push({ title: product.title, url: `${origin}/products/${encodeURIComponent(product.handle)}`, soldOut: productSoldOut });
  }
  return {
    previousAt: before.at,
    compared,
    added: after.products.filter((p) => !old.has(p.handle)).length,
    removed: before.products.filter((p) => !now.has(p.handle)).length,
    soldOut,
    restocked,
    priceUp,
    priceDown,
    movers: movers.sort((a, b) => b.soldOut - a.soldOut).slice(0, MOVERS),
  };
}

/**
 * The record to keep after this reading, and what the report shows. Changes are measured against the
 * baseline; the reading replaces it once the baseline is six hours old.
 */
export function nextWatch(record: WatchRecord | null, snapshot: WatchSnapshot, origin: string): { readonly record: WatchRecord; readonly watch: ShopWatch } {
  if (!record) return { record: { firstSeenAt: snapshot.at, readings: 1, baseline: snapshot }, watch: { firstSeenAt: snapshot.at, readings: 1, changes: null } };
  const changes = compareSnapshots(record.baseline, snapshot, origin);
  const renew = Date.parse(snapshot.at) - Date.parse(record.baseline.at) >= BASELINE_MS;
  const readings = record.readings + 1;
  return {
    record: { firstSeenAt: record.firstSeenAt, readings, baseline: renew ? snapshot : record.baseline },
    watch: { firstSeenAt: record.firstSeenAt, readings, changes },
  };
}

/** A kept record, checked: anything else (an older shape, a damaged entry) starts the watch again. */
export function asWatchRecord(value: unknown): WatchRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<WatchRecord>;
  if (typeof record.firstSeenAt !== "string" || typeof record.readings !== "number" || !record.baseline || !Array.isArray(record.baseline.products) || typeof record.baseline.at !== "string") return null;
  return record as WatchRecord;
}
