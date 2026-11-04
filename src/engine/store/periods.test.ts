import { describe, expect, it } from "vitest";
import type { StoreOrder } from "@/domain/store";
import { alignDays, change, dayRange, salesPeriods } from "./periods";

const order = (day: string, total: number, extra: Partial<StoreOrder> = {}): StoreOrder => ({
  id: `${day}-${total}`,
  createdAt: `${day}T10:00:00Z`,
  country: "FR",
  total,
  tax: 0,
  shipping: 0,
  refunded: 0,
  cancelled: false,
  test: false,
  lines: [],
  ...extra,
});
const NOW = Date.parse("2026-11-05T12:00:00Z");

describe("change", () => {
  it("says up, down or flat, and nothing without a period before", () => {
    expect(change(120, 100)).toMatchObject({ ratio: 0.19999999999999996, direction: "up" });
    expect(change(80, 100).direction).toBe("down");
    expect(change(101, 100).direction).toBe("flat");
    expect(change(5, null)).toEqual({ current: 5, previous: null, ratio: null, direction: null });
    expect(change(5, 0)).toEqual({ current: 5, previous: 0, ratio: null, direction: "up" });
  });
});

describe("dayRange", () => {
  it("lists UTC days ending today, oldest first", () => {
    expect(dayRange(NOW, 3)).toEqual(["2026-11-03", "2026-11-04", "2026-11-05"]);
  });
});

describe("salesPeriods", () => {
  it("compares the last 30 days with the 30 before, net of refunds, without cancelled or test orders", () => {
    const orders = [
      order("2026-11-05", 100, { refunded: 20 }),
      order("2026-10-20", 50),
      order("2026-10-20", 999, { cancelled: true }),
      order("2026-10-20", 999, { test: true }),
      order("2026-10-01", 40),
    ];
    const p = salesPeriods(orders, NOW, "2025-11-01", true);
    expect(p.current.days).toHaveLength(30);
    expect(p.current.totalRevenue).toBe(130);
    expect(p.current.totalOrders).toBe(2);
    expect(p.current.revenue.at(-1)).toBe(80);
    expect(p.previous?.totalRevenue).toBe(40);
    expect(p.revenue.direction).toBe("up");
    expect(p.averageOrder).toMatchObject({ current: 65, previous: 40 });
  });

  it("does not invent a zero for a period before the orders were read", () => {
    const p = salesPeriods([order("2026-11-01", 10)], NOW, "2026-10-20", true);
    expect(p.previous).toBeNull();
    expect(p.revenue.direction).toBeNull();
  });

  it("knows the period before from the oldest order when the read stopped early", () => {
    expect(salesPeriods([order("2026-11-01", 10)], NOW, "2025-11-01", false).previous).toBeNull();
    expect(salesPeriods([order("2026-11-01", 10), order("2026-09-01", 5)], NOW, "2025-11-01", false).previous?.totalRevenue).toBe(0);
  });
});

describe("alignDays", () => {
  it("puts each value on its day and zero elsewhere", () => {
    const days = ["2026-11-01", "2026-11-02"];
    expect(alignDays(days, [{ day: "2026-11-02", sessions: 7, visitors: 5, carts: 0, checkouts: 0, purchases: 0 }], (r) => r.sessions)).toEqual([0, 7]);
  });
});
