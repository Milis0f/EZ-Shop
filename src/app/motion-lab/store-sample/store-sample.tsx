"use client";

import { InstagramView, StripeView } from "@/components/store/store-channels";
import { StoreOverviewBoard } from "@/components/store/store-overview";
import "@/components/store/store-board.css";
import type { InstagramResult, StoreSummary, StoreTraffic, StripeResult, TrafficDay } from "@/domain/store";
import { change, dayRange, type SalesPeriods } from "@/engine/store/periods";

/** Made-up, deterministic figures: a weekly rhythm and a slow rise, enough to see every chart drawn. */

const NOW = Date.parse("2026-11-05T12:00:00Z");
const DAY = 86_400_000;
const days = dayRange(NOW, 30);
const before = dayRange(NOW - 30 * DAY, 30);
const wave = (i: number, base: number, rise: number) => Math.max(0, Math.round(base + rise * i + base * 0.35 * Math.sin(i / 1.15)));
const trafficDays = (list: readonly string[], base: number, rise: number): TrafficDay[] =>
  list.map((day, i) => {
    const sessions = wave(i, base, rise);
    return { day, sessions, visitors: Math.round(sessions * 0.82), carts: Math.round(sessions * 0.08), checkouts: Math.round(sessions * 0.035), purchases: Math.round(sessions * 0.018) };
  });
const now = trafficDays(days, 60, 1.6);
const prev = trafficDays(before, 52, 0.4);
const sum = (rows: readonly TrafficDay[], key: keyof Omit<TrafficDay, "day">) => rows.reduce((s, r) => s + r[key], 0);
const totals = (rows: readonly TrafficDay[]) => ({ sessions: sum(rows, "sessions"), visitors: sum(rows, "visitors"), carts: sum(rows, "carts"), checkouts: sum(rows, "checkouts"), purchases: sum(rows, "purchases"), pageviews: sum(rows, "sessions") * 3, bounces: Math.round(sum(rows, "sessions") * 0.42), averageSeconds: 84 });

const traffic: StoreTraffic = {
  since: days[0],
  until: days.at(-1) ?? days[0],
  totals: totals(now),
  botSessions: 140,
  byDay: now,
  byCountry: [],
  bySource: [
    { type: "social", name: "Instagram", ...totals(now.slice(0, 12)) },
    { type: "organic", name: "Google", ...totals(now.slice(12, 20)) },
    { type: "direct", name: null, ...totals(now.slice(20, 25)) },
    { type: "paid", name: "Facebook", ...totals(now.slice(25, 28)) },
    { type: "email", name: "Klaviyo", ...totals(now.slice(28, 29)) },
    { type: "referral", name: "Blog", ...totals(now.slice(29)) },
  ],
  byDevice: [],
  byLanding: [],
  previous: { totals: totals(prev), byDay: prev },
  readAt: new Date(NOW).toISOString(),
};

const revenue = days.map((_, i) => Math.round(wave(i, 320, 9) * 1.1));
const revenueBefore = before.map((_, i) => wave(i, 300, 1));
const orders = revenue.map((v) => Math.max(0, Math.round(v / 42)));
const ordersBefore = revenueBefore.map((v) => Math.max(0, Math.round(v / 41)));
const total = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
const win = (list: readonly string[], rev: readonly number[], ord: readonly number[]) => ({ days: list, revenue: rev, orders: ord, totalRevenue: total(rev), totalOrders: total(ord), averageOrder: Math.round((total(rev) / total(ord)) * 100) / 100 });
const current = win(days, revenue, orders);
const previous = win(before, revenueBefore, ordersBefore);
const periods: SalesPeriods = {
  current,
  previous,
  revenue: change(current.totalRevenue, previous.totalRevenue),
  orders: change(current.totalOrders, previous.totalOrders),
  averageOrder: change(current.averageOrder, previous.averageOrder),
};

const summary: StoreSummary = {
  currency: "EUR",
  orders: 412,
  revenue: 17_820,
  averageOrder: 43.25,
  taxes: 2970,
  shipping: 1240,
  refunds: 310,
  units: 690,
  byCountry: [
    { country: "FR", orders: 250, revenue: 10_800, taxes: 1800, shipping: 700, units: 410, share: 0.61 },
    { country: "BE", orders: 90, revenue: 3900, taxes: 650, shipping: 300, units: 150, share: 0.22 },
    { country: "CH", orders: 72, revenue: 3120, taxes: 520, shipping: 240, units: 130, share: 0.17 },
  ],
  byMonth: dayRange(NOW, 12).map((d, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, orders: 20 + i * 3, revenue: 800 + i * 160 })).slice(0, 11),
  products: [],
  shipsWithoutSales: ["DE", "ES"],
  lowStock: [],
  unsold: [],
  cancelled: 4,
  testOrders: 0,
  testOnly: false,
};

const instagram: InstagramResult = {
  ok: true,
  report: {
    username: "sample.shop",
    name: "Sample",
    picture: null,
    followers: 12_480,
    posts: 214,
    since: dayRange(NOW, 28)[0],
    until: days.at(-1) ?? "",
    reachByDay: dayRange(NOW, 28).map((day, i) => ({ day, value: wave(i, 900, 25) })),
    totals: { views: 84_200, reach: 31_400, accountsEngaged: 2_870, interactions: 5_140, linkTaps: 640 },
    recent: [],
    readAt: new Date(NOW).toISOString(),
  },
};

const stripe: StripeResult = {
  ok: true,
  report: {
    currency: "EUR",
    since: before[0],
    current: { gross: 9_860, refunded: 140, payments: 228, failed: 9, disputed: 1 },
    previous: { gross: 8_120, refunded: 210, payments: 196, failed: 14, disputed: 0 },
    byDay: days.map((day, i) => ({ day, gross: wave(i, 290, 6), refunded: 0, payments: 7 })),
    methods: [
      { key: "visa", payments: 120 },
      { key: "mastercard", payments: 60 },
      { key: "apple_pay", payments: 30 },
      { key: "paypal", payments: 12 },
      { key: "amex", payments: 6 },
    ],
    countries: [
      { key: "FR", payments: 150 },
      { key: "BE", payments: 48 },
      { key: "CH", payments: 30 },
    ],
    available: 2_340,
    pending: 1_120,
    capped: false,
    otherCurrencies: 0,
    readAt: new Date(NOW).toISOString(),
  },
};

export function StoreSample() {
  return (
    <div className="flex flex-col gap-4">
      <StoreOverviewBoard summary={summary} periods={periods} traffic={traffic} currency="EUR" onOpen={() => undefined} />
      <div className="grid gap-4 min-[1000px]:grid-cols-2">
        <InstagramView state={{ status: "done", data: instagram }} compact />
        <StripeView state={{ status: "done", data: stripe }} compact />
      </div>
      <StripeView state={{ status: "done", data: stripe }} />
    </div>
  );
}
