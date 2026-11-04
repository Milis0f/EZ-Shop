import type { WatchSnapshot } from "./watch";

/**
 * The history of a competitor, built only from the dated readings kept on this computer. A product
 * missing from one reading is "missing" (a page error or a pause is possible); it is "removed" only
 * after two readings in a row without it. A reading that stopped before the end of the catalogue says
 * nothing about absent products. Nothing before the first reading is shown.
 */

export interface ObservatoryReading {
  readonly at: string;
  readonly snapshot: WatchSnapshot;
  /** The whole public catalogue was read; false when the read stopped at its page limit. */
  readonly complete: boolean;
}

export const OBSERVATORY_EVENTS = ["added", "missing", "removed", "returned", "price_up", "price_down", "sold_out", "restocked"] as const;
export type ObservatoryEventKind = (typeof OBSERVATORY_EVENTS)[number];

export interface ObservatoryEvent {
  readonly at: string;
  readonly kind: ObservatoryEventKind;
  readonly handle: string;
  readonly title: string;
  /** Lowest variant price before and after, for price events. */
  readonly from: number | null;
  readonly to: number | null;
  /** Variants concerned, for stock events. */
  readonly variants: number;
}

export interface ObservatoryPoint {
  readonly at: string;
  readonly products: number;
  /** Share of variants in stock, 0–1; null without stock flags. */
  readonly inStockShare: number | null;
  readonly medianPrice: number | null;
  readonly complete: boolean;
}

export interface ObservatoryHistory {
  readonly firstAt: string | null;
  readonly lastAt: string | null;
  readonly readings: number;
  readonly series: readonly ObservatoryPoint[];
  /** Most recent first. */
  readonly events: readonly ObservatoryEvent[];
  readonly counts: Readonly<Record<ObservatoryEventKind, number>>;
}

export const MAX_EVENTS = 200;

type Product = WatchSnapshot["products"][number];

const lowestPrice = (product: Product): number | null => {
  const prices = product.variants.map((v) => v[2]).filter((p): p is number => p !== null);
  return prices.length ? Math.min(...prices) : null;
};

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pointOf(reading: ObservatoryReading): ObservatoryPoint {
  const variants = reading.snapshot.products.flatMap((p) => p.variants);
  const prices = reading.snapshot.products.map(lowestPrice).filter((p): p is number => p !== null);
  return {
    at: reading.at,
    products: reading.snapshot.products.length,
    inStockShare: variants.length ? Math.round((variants.filter((v) => v[1] === 1).length / variants.length) * 1000) / 1000 : null,
    medianPrice: median(prices),
    complete: reading.complete,
  };
}

function stockEvents(at: string, before: Product, after: Product): ObservatoryEvent[] {
  const was = new Map(before.variants.map((v) => [v[0], v[1]]));
  let out = 0;
  let back = 0;
  for (const [id, stock] of after.variants) {
    const old = was.get(id);
    if (old === 1 && stock === 0) out += 1;
    if (old === 0 && stock === 1) back += 1;
  }
  const event = (kind: ObservatoryEventKind, variants: number): ObservatoryEvent => ({ at, kind, handle: after.handle, title: after.title, from: null, to: null, variants });
  return [...(out ? [event("sold_out", out)] : []), ...(back ? [event("restocked", back)] : [])];
}

function priceEvent(at: string, before: Product, after: Product): ObservatoryEvent | null {
  const from = lowestPrice(before);
  const to = lowestPrice(after);
  if (from === null || to === null || from === to) return null;
  return { at, kind: to > from ? "price_up" : "price_down", handle: after.handle, title: after.title, from, to, variants: 0 };
}

export function buildHistory(readingsIn: readonly ObservatoryReading[]): ObservatoryHistory {
  const readings = [...readingsIn].sort((a, b) => a.at.localeCompare(b.at));
  const events: ObservatoryEvent[] = [];
  const everSeen = new Set<string>();
  /** Consecutive complete readings each product has been absent from. */
  const absentFor = new Map<string, number>();
  const lastKnown = new Map<string, Product>();

  readings.forEach((reading, index) => {
    const current = new Map(reading.snapshot.products.map((p) => [p.handle, p]));
    const previous = index > 0 ? readings[index - 1] : null;
    for (const product of current.values()) {
      const known = lastKnown.get(product.handle);
      if (index > 0 && !everSeen.has(product.handle) && previous?.complete) events.push({ at: reading.at, kind: "added", handle: product.handle, title: product.title, from: null, to: null, variants: 0 });
      if ((absentFor.get(product.handle) ?? 0) > 0) events.push({ at: reading.at, kind: "returned", handle: product.handle, title: product.title, from: null, to: null, variants: 0 });
      if (known && previous?.snapshot.products.some((p) => p.handle === product.handle)) {
        const price = priceEvent(reading.at, known, product);
        if (price) events.push(price);
        events.push(...stockEvents(reading.at, known, product));
      }
      absentFor.set(product.handle, 0);
      everSeen.add(product.handle);
      lastKnown.set(product.handle, product);
    }
    if (!reading.complete) return;
    for (const [handle, product] of lastKnown) {
      if (current.has(handle)) continue;
      const streak = (absentFor.get(handle) ?? 0) + 1;
      absentFor.set(handle, streak);
      if (streak === 1) events.push({ at: reading.at, kind: "missing", handle, title: product.title, from: null, to: null, variants: 0 });
      if (streak === 2) events.push({ at: reading.at, kind: "removed", handle, title: product.title, from: null, to: null, variants: 0 });
    }
  });

  const counts = Object.fromEntries(OBSERVATORY_EVENTS.map((kind) => [kind, events.filter((e) => e.kind === kind).length])) as Record<ObservatoryEventKind, number>;
  return {
    firstAt: readings[0]?.at ?? null,
    lastAt: readings.at(-1)?.at ?? null,
    readings: readings.length,
    series: readings.map(pointOf),
    events: events.reverse().slice(0, MAX_EVENTS),
    counts,
  };
}
