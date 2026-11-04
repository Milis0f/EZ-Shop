import { describe, expect, it } from "vitest";
import { buildHistory, type ObservatoryReading } from "./observatory";
import type { WatchedVariant } from "./watch";

const product = (handle: string, variants: WatchedVariant[]) => ({ handle, title: handle.toUpperCase(), variants });
const reading = (at: string, products: ReturnType<typeof product>[], complete = true): ObservatoryReading => ({ at, complete, snapshot: { at, products } });

describe("buildHistory", () => {
  it("starts at the first reading and invents nothing before", () => {
    const history = buildHistory([reading("2026-11-01T00:00:00Z", [product("a", [["1", 1, 10]])])]);
    expect(history).toMatchObject({ firstAt: "2026-11-01T00:00:00Z", readings: 1, events: [] });
    expect(history.series[0]).toMatchObject({ products: 1, inStockShare: 1, medianPrice: 10 });
  });

  it("calls a product removed only after two readings without it", () => {
    const history = buildHistory([
      reading("2026-11-01T00:00:00Z", [product("a", [["1", 1, 10]]), product("b", [["2", 1, 20]])]),
      reading("2026-11-02T00:00:00Z", [product("a", [["1", 1, 10]])]),
      reading("2026-11-03T00:00:00Z", [product("a", [["1", 1, 10]])]),
    ]);
    expect(history.events.map((e) => `${e.kind}:${e.handle}`)).toEqual(["removed:b", "missing:b"]);
  });

  it("says nothing about absent products when a reading stopped early", () => {
    const history = buildHistory([
      reading("2026-11-01T00:00:00Z", [product("a", [["1", 1, 10]]), product("b", [["2", 1, 20]])]),
      reading("2026-11-02T00:00:00Z", [product("a", [["1", 1, 10]])], false),
      reading("2026-11-03T00:00:00Z", [product("a", [["1", 1, 10]])], false),
    ]);
    expect(history.counts.missing).toBe(0);
    expect(history.counts.removed).toBe(0);
  });

  it("records a return after a missing reading", () => {
    const history = buildHistory([
      reading("2026-11-01T00:00:00Z", [product("a", [["1", 1, 10]])]),
      reading("2026-11-02T00:00:00Z", []),
      reading("2026-11-03T00:00:00Z", [product("a", [["1", 1, 10]])]),
    ]);
    expect(history.events.map((e) => e.kind)).toEqual(["returned", "missing"]);
  });

  it("records additions, price moves and stock moves between readings", () => {
    const history = buildHistory([
      reading("2026-11-01T00:00:00Z", [product("a", [["1", 1, 10], ["2", 1, 10]])]),
      reading("2026-11-02T00:00:00Z", [product("a", [["1", 0, 12], ["2", 1, 12]]), product("c", [["3", 1, 5]])]),
    ]);
    const kinds = history.events.map((e) => e.kind).sort();
    expect(kinds).toEqual(["added", "price_up", "sold_out"]);
    expect(history.events.find((e) => e.kind === "price_up")).toMatchObject({ from: 10, to: 12 });
    expect(history.series[1]).toMatchObject({ products: 2, inStockShare: 0.667 });
  });

  it("does not call products added after a partial reading", () => {
    const history = buildHistory([
      reading("2026-11-01T00:00:00Z", [product("a", [["1", 1, 10]])], false),
      reading("2026-11-02T00:00:00Z", [product("a", [["1", 1, 10]]), product("b", [["2", 1, 9]])]),
    ]);
    expect(history.counts.added).toBe(0);
  });

  it("sorts readings given out of order", () => {
    const history = buildHistory([reading("2026-11-02T00:00:00Z", []), reading("2026-11-01T00:00:00Z", [])]);
    expect(history.firstAt).toBe("2026-11-01T00:00:00Z");
  });
});
