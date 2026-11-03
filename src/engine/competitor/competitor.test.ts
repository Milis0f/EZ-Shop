import { describe, expect, it } from "vitest";
import { estimateSales, type EstimateInput } from "./sales-estimate";
import { asWatchRecord, BASELINE_MS, buildSnapshot, compareSnapshots, nextWatch } from "./watch";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const monthsAgo = (months: number) => new Date(NOW - months * 30.44 * 86_400_000).toISOString();

const input = (extra: Partial<EstimateInput> = {}): EstimateInput => ({
  basis: "product",
  reviews: 40,
  ages: [{ from: "product_published", at: monthsAgo(10) }],
  price: 50,
  priceAssumed: false,
  currency: "EUR",
  importedReviewsPossible: false,
  nowMs: NOW,
  ...extra,
});

describe("sales estimated from reviews", () => {
  it("turns reviews into a range of buyers with the assumed review rates", () => {
    const e = estimateSales(input());
    expect(e).toMatchObject({ basis: "product", reviews: 40, ageFrom: "product_published", confidence: "medium", cautions: [] });
    expect(e?.total).toEqual({ p10: 800, p50: 2000, p90: 4000 });
    expect(e?.months).toBeCloseTo(10, 1);
    expect(e?.perMonth.p50).toBeCloseTo(200, 0);
    expect(e?.revenuePerMonth?.p50).toBeCloseTo(10_000, -1);
  });

  it("gives no estimate without reviews or without an age", () => {
    expect(estimateSales(input({ reviews: null }))).toBeNull();
    expect(estimateSales(input({ reviews: 0 }))).toBeNull();
    expect(estimateSales(input({ ages: [{ from: "product_published", at: null }] }))).toBeNull();
    expect(estimateSales(input({ ages: [{ from: "product_published", at: "2030-01-01T00:00:00Z" }] }))).toBeNull();
  });

  it("takes the first known age, and says when it comes from the domain", () => {
    const e = estimateSales(input({ basis: "shop", ages: [{ from: "domain_registered", at: null }, { from: "first_archived", at: monthsAgo(12) }], priceAssumed: true }));
    expect(e?.ageFrom).toBe("first_archived");
    expect(e?.cautions).toEqual(expect.arrayContaining(["age_from_domain", "price_assumed"]));
  });

  it("lowers the confidence for few, possibly imported or young reviews", () => {
    expect(estimateSales(input({ reviews: 5 }))).toMatchObject({ confidence: "low", cautions: ["few_reviews"] });
    expect(estimateSales(input({ importedReviewsPossible: true }))).toMatchObject({ confidence: "low", cautions: ["imported_reviews"] });
    const young = estimateSales(input({ ages: [{ from: "product_published", at: monthsAgo(0.2) }] }));
    expect(young).toMatchObject({ confidence: "low", months: 1 });
    expect(young?.cautions).toContain("young");
  });

  it("has no revenue without a price", () => {
    expect(estimateSales(input({ price: null }))?.revenuePerMonth).toBeNull();
  });
});

describe("following a shop between two readings", () => {
  const product = (handle: string, variants: Array<[number, boolean, string]>) => ({ handle, title: handle.toUpperCase(), variants: variants.map(([id, available, price]) => ({ id, available, price })) });
  const first = buildSnapshot([product("a", [[1, true, "100"], [2, true, "100"], [3, false, "100"]]), product("b", [[4, true, "50"]]), product("gone", [[9, true, "10"]])], "2026-11-01T10:00:00Z");
  const second = buildSnapshot([product("a", [[1, false, "100"], [2, false, "100"], [3, true, "100"]]), product("b", [[4, true, "60"]]), product("new", [[7, true, "20"]])], "2026-11-02T10:00:00Z");

  it("counts what sold out, came back, changed price, appeared and left", () => {
    expect(compareSnapshots(first, second, "https://s.example")).toEqual({
      previousAt: "2026-11-01T10:00:00Z",
      compared: 2,
      added: 1,
      removed: 1,
      soldOut: 2,
      restocked: 1,
      priceUp: 1,
      priceDown: 0,
      movers: [{ title: "A", url: "https://s.example/products/a", soldOut: 2 }],
    });
  });

  it("starts a watch, then compares with the baseline and renews it after six hours", () => {
    const start = nextWatch(null, first, "https://s.example");
    expect(start.watch).toEqual({ firstSeenAt: first.at, readings: 1, changes: null });
    const soon = { ...second, at: new Date(Date.parse(first.at) + BASELINE_MS / 2).toISOString() };
    const again = nextWatch(start.record, soon, "https://s.example");
    expect(again.watch.readings).toBe(2);
    expect(again.watch.changes?.soldOut).toBe(2);
    expect(again.record.baseline).toBe(first);
    const later = nextWatch(again.record, second, "https://s.example");
    expect(later.record.baseline).toBe(second);
  });

  it("ignores variants without a stock flag and checks a kept record", () => {
    expect(buildSnapshot([{ handle: "x", title: "X", variants: [{ id: 1 }] }], "2026-11-01T00:00:00Z").products[0]?.variants).toEqual([]);
    expect(asWatchRecord({ firstSeenAt: "x", readings: 1, baseline: { at: "y", products: [] } })).not.toBeNull();
    expect(asWatchRecord({ old: true })).toBeNull();
    expect(asWatchRecord(null)).toBeNull();
  });
});
