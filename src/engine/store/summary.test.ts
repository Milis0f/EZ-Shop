import { describe, expect, it } from "vitest";
import type { StoreOrder, StoreProduct, StoreSnapshot } from "@/domain/store";
import { costPerPurchase, countedOrders, roas, summariseStore } from "./summary";

const product = (id: string, extra: Partial<StoreProduct> = {}): StoreProduct => ({
  id,
  title: `Produit ${id}`,
  handle: id,
  status: "ACTIVE",
  vendor: null,
  productType: null,
  priceMin: 20,
  priceMax: 20,
  inventory: 50,
  url: null,
  ...extra,
});

const order = (id: string, country: string | null, lines: Array<[string, number, number]>, extra: Partial<StoreOrder> = {}): StoreOrder => ({
  id,
  createdAt: "2026-10-15T10:00:00Z",
  country,
  total: lines.reduce((sum, [, , total]) => sum + total, 0) + 5,
  tax: 4,
  shipping: 5,
  refunded: 0,
  cancelled: false,
  test: false,
  lines: lines.map(([productId, quantity, total]) => ({ productId, title: productId, quantity, total })),
  ...extra,
});

const snapshot = (orders: StoreOrder[], extra: Partial<StoreSnapshot> = {}): StoreSnapshot => ({
  shop: { name: "Test", domain: "t.myshopify.com", currency: "EUR", plan: null, taxesIncluded: true, shipsTo: ["FR", "BE", "DE"], primaryUrl: null },
  grantedScopes: [],
  products: [product("a"), product("b", { inventory: 3 }), product("c"), product("d", { status: "DRAFT" })],
  productsCapped: false,
  orders,
  ordersCapped: false,
  ordersSince: "2025-11-01",
  countriesHidden: false,
  readAt: "2026-11-02T12:00:00Z",
  ...extra,
});

describe("summariseStore", () => {
  const orders = [
    order("1", "FR", [["a", 2, 40]]),
    order("2", "FR", [["a", 1, 20], ["b", 1, 20]]),
    order("3", "BE", [["b", 2, 40]], { refunded: 10 }),
    order("4", "FR", [["a", 5, 100]], { cancelled: true }),
  ];
  const summary = summariseStore(snapshot(orders));

  it("adds up net revenue, taxes and shipping of the orders not cancelled", () => {
    expect(summary.orders).toBe(3);
    expect(summary.revenue).toBe(45 + 45 + 45 - 10);
    expect(summary.averageOrder).toBeCloseTo(125 / 3, 2);
    expect(summary.taxes).toBe(12);
    expect(summary.shipping).toBe(15);
    expect(summary.refunds).toBe(10);
    expect(summary.units).toBe(6);
    expect(summary.cancelled).toBe(1);
  });

  it("splits sales by country with their share", () => {
    expect(summary.byCountry.map((row) => [row.country, row.orders, row.revenue])).toEqual([
      ["FR", 2, 90],
      ["BE", 1, 35],
    ]);
    expect(summary.byCountry[0]?.share).toBeCloseTo(90 / 125, 5);
  });

  it("ranks products by revenue and keeps their countries", () => {
    expect(summary.products.slice(0, 2).map((p) => [p.id, p.units, p.revenue, p.orders])).toEqual([
      ["a", 3, 60],
      ["b", 3, 60],
    ].map(([id, units, revenue]) => [id, units, revenue, id === "a" ? 2 : 2]));
    expect(summary.products.find((p) => p.id === "b")?.countries).toEqual(["BE", "FR"]);
  });

  it("names the countries shipped to without a sale, low stock and unsold active products", () => {
    expect(summary.shipsWithoutSales).toEqual(["DE"]);
    expect(summary.lowStock).toEqual(["b"]);
    expect(summary.unsold).toEqual(["c"]);
  });

  it("gives twelve months, the last one being the month read", () => {
    expect(summary.byMonth).toHaveLength(12);
    expect(summary.byMonth.at(-1)).toEqual({ month: "2026-11", orders: 0, revenue: 0 });
    expect(summary.byMonth.at(-2)).toEqual({ month: "2026-10", orders: 3, revenue: 125 });
  });

  it("claims no country without sales when Shopify hid the addresses", () => {
    const hidden = summariseStore(snapshot(orders.map((o) => ({ ...o, country: null })), { countriesHidden: true }));
    expect(hidden.shipsWithoutSales).toEqual([]);
    expect(hidden.byCountry[0]?.country).toBeNull();
  });

  it("has no average with no order", () => {
    expect(summariseStore(snapshot([])).averageOrder).toBeNull();
  });
});

describe("test orders", () => {
  it("leaves them out when real orders exist", () => {
    const result = countedOrders([order("1", "FR", [["a", 1, 20]]), order("2", "FR", [["a", 1, 20]], { test: true })]);
    expect(result.counted.map((o) => o.id)).toEqual(["1"]);
    expect(result.testOnly).toBe(false);
  });

  it("counts them in a store that has nothing else, and says so", () => {
    const summary = summariseStore(snapshot([order("1", "FR", [["a", 1, 20]], { test: true })]));
    expect(summary.orders).toBe(1);
    expect(summary.testOnly).toBe(true);
    expect(summary.testOrders).toBe(1);
  });
});

describe("ads ratios", () => {
  const row = { label: "x", spend: 100, impressions: 1000, clicks: 50, purchases: 4, purchaseValue: 320 };
  it("computes ROAS and cost per purchase only from reported values", () => {
    expect(roas(row)).toBeCloseTo(3.2);
    expect(costPerPurchase(row)).toBe(25);
    expect(roas({ ...row, purchaseValue: null })).toBeNull();
    expect(costPerPurchase({ ...row, purchases: 0 })).toBeNull();
    expect(roas({ ...row, spend: 0 })).toBeNull();
  });
});
