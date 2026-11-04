import { describe, expect, it } from "vitest";
import type { StoreTraffic } from "@/domain/store";
import { funnelOf, platformOf, ratio, trafficInsight } from "./traffic";

const counts = (sessions: number, carts = 0, purchases = 0) => ({ sessions, visitors: sessions, carts, checkouts: purchases, purchases });

const traffic = (extra: Partial<StoreTraffic> = {}): StoreTraffic => ({
  since: "2026-10-03",
  until: "2026-11-02",
  totals: { sessions: 200, visitors: 150, carts: 20, checkouts: 8, purchases: 4, pageviews: 600, bounces: 90, averageSeconds: 75 },
  botSessions: 12,
  previous: null,
  byDay: [
    { day: "2026-10-30", ...counts(40) },
    { day: "2026-10-31", ...counts(90, 9, 2) },
    { day: "2026-11-01", ...counts(70) },
  ],
  byCountry: [{ key: "FR", ...counts(120, 12, 3) }],
  bySource: [
    { type: "paid", name: "Facebook", ...counts(50, 5, 1) },
    { type: "paid", name: "Instagram", ...counts(20, 2, 0) },
    { type: "paid", name: "Google", ...counts(30, 4, 2) },
    { type: "organic", name: "Google", ...counts(40, 3, 1) },
    { type: "direct", name: null, ...counts(60, 6, 0) },
  ],
  byDevice: [],
  byLanding: [],
  readAt: "2026-11-02T12:00:00Z",
  ...extra,
});

describe("the visits, worked out", () => {
  it("gives each step of the visit as a share of the step before", () => {
    expect(funnelOf({ sessions: 200, visitors: 150, carts: 20, checkouts: 8, purchases: 4 })).toEqual([
      { step: "sessions", value: 200, fromPrevious: null },
      { step: "carts", value: 20, fromPrevious: 0.1 },
      { step: "checkouts", value: 8, fromPrevious: 0.4 },
      { step: "purchases", value: 4, fromPrevious: 0.5 },
    ]);
    expect(funnelOf({ sessions: 0, visitors: 0, carts: 0, checkouts: 0, purchases: 0 })[1]?.fromPrevious).toBeNull();
  });

  it("counts repeat visits, rates and the busiest day", () => {
    const insight = trafficInsight(traffic());
    expect(insight.repeatVisits).toBe(50);
    expect(insight.visitsPerVisitor).toBeCloseTo(200 / 150);
    expect(insight.cartRate).toBe(0.1);
    expect(insight.conversionRate).toBe(0.02);
    expect(insight.cartToPurchase).toBe(0.2);
    expect(insight.bounceRate).toBe(0.45);
    expect(insight.busiestDay?.day).toBe("2026-10-31");
    expect(insight.topCountry?.key).toBe("FR");
  });

  it("credits only paid visits to the ad platforms, by the referring site", () => {
    const insight = trafficInsight(traffic());
    expect(insight.fromAds.meta.sessions).toBe(70);
    expect(insight.fromAds.google.sessions).toBe(30);
    expect(insight.fromAds.tiktok.sessions).toBe(0);
    expect(insight.paid.sessions).toBe(100);
    expect(insight.paid.purchases).toBe(3);
  });

  it("never invents a rate without visits", () => {
    const insight = trafficInsight(traffic({ totals: { sessions: 0, visitors: 0, carts: 0, checkouts: 0, purchases: 0, pageviews: 0, bounces: 0, averageSeconds: null }, byDay: [] }));
    expect(insight.conversionRate).toBeNull();
    expect(insight.repeatVisits).toBe(0);
    expect(insight.busiestDay).toBeNull();
    expect(ratio(1, 0)).toBeNull();
  });

  it("recognises the ad platforms by name", () => {
    expect(platformOf("Instagram")).toBe("meta");
    expect(platformOf("YouTube")).toBe("google");
    expect(platformOf("TikTok")).toBe("tiktok");
    expect(platformOf("Bing")).toBeNull();
    expect(platformOf(null)).toBeNull();
  });
});
