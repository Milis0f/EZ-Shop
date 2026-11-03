import type { StoreTraffic, TrafficCounts, TrafficDay, TrafficSlice } from "@/domain/store";

/**
 * Plain arithmetic on the visits Shopify counted: rates between the steps of a visit, repeat visits and
 * the visits sent by each ad platform. No estimate: each figure is a ratio or a difference of two
 * figures the store reported.
 */

export const FUNNEL_STEPS = ["sessions", "carts", "checkouts", "purchases"] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export const AD_PLATFORMS = ["google", "meta", "tiktok"] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

/** How Shopify names the sites of each ad platform in `referrer_name`. */
const PLATFORM_NAMES: Readonly<Record<AdPlatform, RegExp>> = {
  google: /google|youtube/i,
  meta: /facebook|instagram|messenger|meta|threads/i,
  tiktok: /tiktok/i,
};

export interface FunnelRow {
  readonly step: FunnelStep;
  readonly value: number;
  /** Share of the previous step that reached this one, 0 to 1; null for the first step or after zero. */
  readonly fromPrevious: number | null;
}

export interface TrafficInsight {
  readonly funnel: readonly FunnelRow[];
  readonly cartRate: number | null;
  readonly conversionRate: number | null;
  /** Of the visits with a cart addition, the share that ended with a purchase. */
  readonly cartToPurchase: number | null;
  readonly bounceRate: number | null;
  /** Visits beyond each visitor's first one: visits minus unique visitors. */
  readonly repeatVisits: number;
  readonly visitsPerVisitor: number | null;
  /** Visits Shopify marked as paid, whatever the platform. */
  readonly paid: TrafficCounts;
  /** Paid visits sent by each ad platform, recognised by the referring site's name. */
  readonly fromAds: Readonly<Record<AdPlatform, TrafficCounts>>;
  readonly busiestDay: TrafficDay | null;
  readonly topCountry: TrafficSlice | null;
}

export const ratio = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

const ZERO: TrafficCounts = { sessions: 0, visitors: 0, carts: 0, checkouts: 0, purchases: 0 };

function add(a: TrafficCounts, b: TrafficCounts): TrafficCounts {
  return { sessions: a.sessions + b.sessions, visitors: a.visitors + b.visitors, carts: a.carts + b.carts, checkouts: a.checkouts + b.checkouts, purchases: a.purchases + b.purchases };
}

export function platformOf(name: string | null): AdPlatform | null {
  if (!name) return null;
  return AD_PLATFORMS.find((platform) => PLATFORM_NAMES[platform].test(name)) ?? null;
}

export function funnelOf(counts: TrafficCounts): FunnelRow[] {
  return FUNNEL_STEPS.map((step, i) => {
    const previous = i > 0 ? counts[FUNNEL_STEPS[i - 1] as FunnelStep] : 0;
    return { step, value: counts[step], fromPrevious: i === 0 ? null : ratio(counts[step], previous) };
  });
}

export function trafficInsight(traffic: StoreTraffic): TrafficInsight {
  const t = traffic.totals;
  const paidSources = traffic.bySource.filter((source) => source.type === "paid");
  const fromAds = Object.fromEntries(
    AD_PLATFORMS.map((platform) => [platform, paidSources.filter((source) => platformOf(source.name) === platform).reduce<TrafficCounts>((sum, source) => add(sum, source), ZERO)]),
  ) as Record<AdPlatform, TrafficCounts>;
  const busiestDay = traffic.byDay.reduce<TrafficDay | null>((best, day) => (day.sessions > (best?.sessions ?? 0) ? day : best), null);
  return {
    funnel: funnelOf(t),
    cartRate: ratio(t.carts, t.sessions),
    conversionRate: ratio(t.purchases, t.sessions),
    cartToPurchase: ratio(t.purchases, t.carts),
    bounceRate: ratio(t.bounces, t.sessions),
    repeatVisits: Math.max(0, t.sessions - t.visitors),
    visitsPerVisitor: ratio(t.sessions, t.visitors),
    paid: paidSources.reduce<TrafficCounts>((sum, source) => add(sum, source), ZERO),
    fromAds,
    busiestDay,
    topCountry: traffic.byCountry[0] ?? null,
  };
}
