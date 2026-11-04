import type { StoreOrder, TrafficDay } from "@/domain/store";
import { countedOrders } from "./summary";

/**
 * The last 30 days next to the 30 before: day by day for the curves, in totals for the change shown
 * in green or red. Plain arithmetic on what Shopify reported; days are UTC calendar days.
 */

export const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export type Direction = "up" | "down" | "flat";

export interface Change {
  readonly current: number;
  /** Null when the period before is unknown (not read, or before the store's first order). */
  readonly previous: number | null;
  /** current / previous − 1; null when there is nothing to compare to. */
  readonly ratio: number | null;
  readonly direction: Direction | null;
}

/** Below this share of change, a figure is called flat: a few euros or one visit are not a trend. */
export const FLAT_RATIO = 0.02;

export function change(current: number, previous: number | null): Change {
  if (previous === null || !Number.isFinite(previous)) return { current, previous: null, ratio: null, direction: null };
  if (previous === 0) return { current, previous, ratio: null, direction: current === 0 ? "flat" : "up" };
  const ratio = current / previous - 1;
  return { current, previous, ratio, direction: Math.abs(ratio) < FLAT_RATIO ? "flat" : ratio > 0 ? "up" : "down" };
}

/** The `count` UTC days ending on the day of `endMs`, oldest first. */
export function dayRange(endMs: number, count: number): string[] {
  const end = Date.UTC(new Date(endMs).getUTCFullYear(), new Date(endMs).getUTCMonth(), new Date(endMs).getUTCDate());
  return Array.from({ length: count }, (_, i) => new Date(end - (count - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}

export interface SalesWindow {
  readonly days: readonly string[];
  readonly revenue: readonly number[];
  readonly orders: readonly number[];
  readonly totalRevenue: number;
  readonly totalOrders: number;
  readonly averageOrder: number | null;
}

export interface SalesPeriods {
  readonly current: SalesWindow;
  /** Null when no order was read as far back: the store is younger than the window, or the read stopped. */
  readonly previous: SalesWindow | null;
  readonly revenue: Change;
  readonly orders: Change;
  readonly averageOrder: Change;
}

function windowOf(orders: readonly StoreOrder[], days: readonly string[]): SalesWindow {
  const index = new Map(days.map((day, i) => [day, i]));
  const revenue = days.map(() => 0);
  const count = days.map(() => 0);
  for (const order of orders) {
    const i = index.get(order.createdAt.slice(0, 10));
    if (i === undefined) continue;
    revenue[i] += order.total - order.refunded;
    count[i] += 1;
  }
  const totalRevenue = Math.round(revenue.reduce((a, b) => a + b, 0) * 100) / 100;
  const totalOrders = count.reduce((a, b) => a + b, 0);
  return { days, revenue: revenue.map((v) => Math.round(v * 100) / 100), orders: count, totalRevenue, totalOrders, averageOrder: totalOrders ? Math.round((totalRevenue / totalOrders) * 100) / 100 : null };
}

/**
 * `readSince` is the first day the orders were read from: a period before it is unknown, never zero.
 * `complete` is false when the order read stopped at its page limit, for the same reason.
 */
export function salesPeriods(orders: readonly StoreOrder[], nowMs: number, readSince: string, complete: boolean): SalesPeriods {
  const { counted } = countedOrders(orders);
  const all = dayRange(nowMs, WINDOW_DAYS * 2);
  const before = all.slice(0, WINDOW_DAYS);
  const current = windowOf(counted, all.slice(WINDOW_DAYS));
  const oldestRead = counted.reduce<string | null>((min, o) => (min === null || o.createdAt < min ? o.createdAt : min), null);
  const known = complete ? before[0] >= readSince : oldestRead !== null && oldestRead.slice(0, 10) <= before[0];
  const previous = known ? windowOf(counted, before) : null;
  return {
    current,
    previous,
    revenue: change(current.totalRevenue, previous?.totalRevenue ?? null),
    orders: change(current.totalOrders, previous?.totalOrders ?? null),
    averageOrder: change(current.averageOrder ?? 0, previous?.averageOrder ?? null),
  };
}

/** A day series aligned on `days`, zero for the days the source did not list. */
export function alignDays(days: readonly string[], rows: readonly TrafficDay[], pick: (row: TrafficDay) => number): number[] {
  const byDay = new Map(rows.map((row) => [row.day, pick(row)]));
  return days.map((day) => byDay.get(day) ?? 0);
}
