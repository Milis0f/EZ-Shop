/**
 * The owner's own store, read from Shopify ("Ma boutique"). Everything here is observed data from the
 * owner's account. It is kept apart from the pre-launch analysis: it never enters a score or a verdict.
 */

export interface StoreShop {
  readonly name: string;
  readonly domain: string;
  /** ISO 4217 code of the store's prices and orders. */
  readonly currency: string;
  readonly plan: string | null;
  /** Prices shown in the store include taxes: they cannot be used as prices before VAT. */
  readonly taxesIncluded: boolean | null;
  /** ISO 3166-1 alpha-2 codes of the countries the store ships to. */
  readonly shipsTo: readonly string[];
}

export interface StoreProduct {
  readonly id: string;
  readonly title: string;
  readonly handle: string;
  /** ACTIVE, DRAFT or ARCHIVED. */
  readonly status: string;
  readonly vendor: string | null;
  readonly productType: string | null;
  readonly priceMin: number | null;
  readonly priceMax: number | null;
  /** Units in stock across variants; null when Shopify does not track the inventory. */
  readonly inventory: number | null;
  readonly url: string | null;
}

export interface StoreOrderLine {
  readonly productId: string | null;
  readonly title: string;
  readonly quantity: number;
  readonly total: number;
}

export interface StoreOrder {
  readonly id: string;
  readonly createdAt: string;
  /** Shipping country, ISO alpha-2; null for orders without shipping or when Shopify withholds addresses. */
  readonly country: string | null;
  readonly total: number;
  readonly tax: number;
  readonly shipping: number;
  readonly refunded: number;
  readonly cancelled: boolean;
  readonly test: boolean;
  readonly lines: readonly StoreOrderLine[];
}

export interface StoreSnapshot {
  readonly shop: StoreShop;
  readonly products: readonly StoreProduct[];
  /** More products exist than were read. */
  readonly productsCapped: boolean;
  readonly orders: readonly StoreOrder[];
  /** More orders exist in the period than were read. */
  readonly ordersCapped: boolean;
  /** First day of the period read (ISO date). */
  readonly ordersSince: string;
  /** Shopify refused the order addresses (protected customer data): orders have no country. */
  readonly countriesHidden: boolean;
  /** Access scopes the store granted to the app, as Shopify lists them. */
  readonly grantedScopes: readonly string[];
  readonly readAt: string;
}

export const STORE_FAILURES = ["remote", "not_configured", "invalid_domain", "unreachable", "not_permitted", "invalid_credentials", "not_installed", "api_error"] as const;
export type StoreFailure = (typeof STORE_FAILURES)[number];

export type StoreResult = { readonly ok: true; readonly snapshot: StoreSnapshot } | { readonly ok: false; readonly code: StoreFailure };

export interface CountrySales {
  /** ISO alpha-2, or null for orders without a known country. */
  readonly country: string | null;
  readonly orders: number;
  readonly revenue: number;
  readonly taxes: number;
  readonly shipping: number;
  readonly units: number;
  /** Share of the store's net revenue, 0 to 1. */
  readonly share: number;
}

export interface MonthSales {
  /** YYYY-MM. */
  readonly month: string;
  readonly orders: number;
  readonly revenue: number;
}

export interface ProductSales extends StoreProduct {
  readonly units: number;
  readonly revenue: number;
  readonly orders: number;
  /** Countries it was shipped to, by units sold. */
  readonly countries: readonly string[];
}

export interface StoreSummary {
  readonly currency: string;
  /** Orders counted: not cancelled, test orders included only when every order is a test. */
  readonly orders: number;
  /** Net revenue: order totals minus refunds. */
  readonly revenue: number;
  readonly averageOrder: number | null;
  readonly taxes: number;
  readonly shipping: number;
  readonly refunds: number;
  readonly units: number;
  readonly byCountry: readonly CountrySales[];
  readonly byMonth: readonly MonthSales[];
  readonly products: readonly ProductSales[];
  /** Countries the store ships to where nothing was sold in the period. */
  readonly shipsWithoutSales: readonly string[];
  /** Active products that sell and have little stock left. */
  readonly lowStock: readonly string[];
  /** Active products with no sale in the period. */
  readonly unsold: readonly string[];
  readonly cancelled: number;
  readonly testOrders: number;
  /** Test orders are counted because the store has no other order. */
  readonly testOnly: boolean;
}

/** Results of the owner's own ad accounts, over the last 30 days. Observed, never used in a verdict. */
export interface AdsRow {
  readonly label: string;
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  /** Purchases attributed by the ad platform; null when it reports none. */
  readonly purchases: number | null;
  /** Value of those purchases, in the account currency. */
  readonly purchaseValue: number | null;
  /** People reached (Meta only, never summed: one person seen in two countries counts once). */
  readonly reach?: number | null;
  /** Clicks to the site rather than to the ad's likes or profile (Meta). */
  readonly linkClicks?: number | null;
  /** Store pages that finished loading after a click (Meta pixel). */
  readonly landingViews?: number | null;
  readonly addToCart?: number | null;
  readonly checkouts?: number | null;
}

export interface AdsDay {
  /** YYYY-MM-DD. */
  readonly day: string;
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly purchases: number | null;
}

export interface AdsReport {
  readonly platform: "meta" | "google";
  readonly currency: string | null;
  readonly period: string;
  readonly total: AdsRow;
  readonly byCountry: readonly AdsRow[];
  readonly campaigns: readonly AdsRow[];
  readonly byDay: readonly AdsDay[];
  readonly readAt: string;
}

export const ADS_FAILURES = ["remote", "not_configured", "unauthorized", "rate_limited", "unreachable", "api_error"] as const;
export type AdsFailure = (typeof ADS_FAILURES)[number];

export type AdsResult = { readonly ok: true; readonly report: AdsReport } | { readonly ok: false; readonly code: AdsFailure };

// ---------- Site traffic (Shopify analytics) ----------

/** Visits of the online store, as Shopify's analytics count them (robots left out). */
export interface TrafficCounts {
  readonly sessions: number;
  /** Unique visitors: one visitor can make several visits. */
  readonly visitors: number;
  /** Visits in which something was added to the cart. */
  readonly carts: number;
  /** Visits that reached the checkout page. */
  readonly checkouts: number;
  /** Visits that ended with a purchase. */
  readonly purchases: number;
}

export interface TrafficTotals extends TrafficCounts {
  readonly pageviews: number;
  /** Visits that ended after one page. */
  readonly bounces: number;
  /** Average length of a visit, in seconds; null without visits. */
  readonly averageSeconds: number | null;
}

export interface TrafficDay extends TrafficCounts {
  /** YYYY-MM-DD. */
  readonly day: string;
}

export interface TrafficSlice extends TrafficCounts {
  /** Country code, device, landing page path, or source name, as Shopify writes them. */
  readonly key: string;
}

export interface TrafficSource extends TrafficCounts {
  /** direct, organic, paid, unknown… in Shopify's words. */
  readonly type: string;
  /** Google, Facebook, Instagram…; null for direct visits. */
  readonly name: string | null;
}

export interface StoreTraffic {
  /** First and last day of the period (ISO dates). */
  readonly since: string;
  readonly until: string;
  readonly totals: TrafficTotals;
  /** Visits Shopify recognised as robots, left out of every other figure. */
  readonly botSessions: number;
  readonly byDay: readonly TrafficDay[];
  readonly byCountry: readonly TrafficSlice[];
  readonly bySource: readonly TrafficSource[];
  readonly byDevice: readonly TrafficSlice[];
  readonly byLanding: readonly TrafficSlice[];
  readonly readAt: string;
}

export const TRAFFIC_FAILURES = [...STORE_FAILURES, "missing_scope", "customer_data", "rate_limited"] as const;
export type TrafficFailure = (typeof TRAFFIC_FAILURES)[number];

export type TrafficResult = { readonly ok: true; readonly traffic: StoreTraffic } | { readonly ok: false; readonly code: TrafficFailure };

// ---------- The local AI's review of the store ----------

export const REVIEW_PRIORITIES = ["high", "medium", "low"] as const;
export const REVIEW_AREAS = ["traffic", "conversion", "ads", "catalogue", "countries"] as const;

export interface ReviewAction {
  readonly title: string;
  readonly why: string;
  readonly priority: (typeof REVIEW_PRIORITIES)[number];
  readonly area: (typeof REVIEW_AREAS)[number];
}

/** Advice written by the local AI from the figures above only: every number it writes is among them. */
export interface StoreReview {
  readonly headline: string;
  readonly strengths: readonly string[];
  readonly problems: readonly string[];
  readonly actions: readonly ReviewAction[];
  /** What the AI was given: the parts that could not be read are named so the advice is read with them in mind. */
  readonly used: { readonly sales: boolean; readonly traffic: boolean; readonly meta: boolean; readonly google: boolean };
  readonly model: string;
  readonly writtenAt: string;
}

export const REVIEW_FAILURES = ["remote", "rate_limited", "no_store", "ai_off", "ai_missing", "ai_failed", "ai_rejected"] as const;
export type ReviewFailure = (typeof REVIEW_FAILURES)[number];

export type ReviewResult = { readonly ok: true; readonly review: StoreReview } | { readonly ok: false; readonly code: ReviewFailure };
