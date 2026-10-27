import type { Datum, Interval } from "./datum";
import type { MonthlyPoint } from "./market";

/**
 * Indirect market signals added in data sources v2. None of them is a search volume:
 * they describe interest, intent, supply and prices, and are always shown as such.
 */

// ---------- Search suggestions (Google Autocomplete) ----------

export interface SearchSuggestions {
  /** Distinct suggestions returned for the country's terms, as typed by users. */
  readonly suggestions: readonly string[];
  /** Suggestions carrying a purchase intent word (buy, price, review, cheap… in the country's language). */
  readonly intent: readonly string[];
  /** Suggestions naming a marketplace or retailer (amazon, aliexpress, ebay, temu…). */
  readonly marketplaces: readonly string[];
}

// ---------- Video content (YouTube) ----------

export interface ContentActivity {
  /** YouTube's own estimate of matching videos published over the last 12 months (approximate by design). */
  readonly videosLast12Months: number;
  readonly sampledVideos: number;
  /** Videos returned by YouTube, as observed (absent from analyses stored before scoring 2026.10-v3). */
  readonly videos?: ReadonlyArray<{ readonly id: string; readonly publishedAt: string; readonly views: number | null }>;
  /**
   * Legacy: median views of the sampled videos, stored before scoring 2026.10-v3. The derived statistic is
   * disabled pending the licence check, so new analyses always store null.
   */
  readonly medianViews: number | null;
  /** Share of sampled videos published in the last 90 days, 0–1. */
  readonly recentShare: number | null;
}

// ---------- Marketplace supply and prices (eBay) ----------

export interface MarketplaceListings {
  readonly marketplaceId: string;
  /** Listings matching the terms on the national site. */
  readonly listings: number;
  readonly sampled: number;
  /** At most five asking prices as displayed to buyers: observed prices, not sales (scoring 2026.10-v3 on). */
  readonly observedPrices?: ReadonlyArray<{ readonly value: number; readonly currency: string }>;
  /** Matching listings located in China, as counted by eBay (scoring 2026.10-v3 on). */
  readonly chinaTotal?: number | null;
  /** Legacy: price quartiles in EUR, stored before scoring 2026.10-v3. No longer computed. */
  readonly priceEur?: { readonly p25: number; readonly median: number; readonly p75: number } | null;
  readonly localCurrency: string | null;
  /** Share of matching listings located in China, 0–1. */
  readonly chinaShare: number | null;
}

// ---------- Topic interest (Wikipedia pageviews) ----------

export interface TopicInterest {
  readonly language: string;
  readonly article: string;
  readonly wikidataId: string;
  /** Monthly human pageviews of the article in that language edition (not per country). */
  readonly points: readonly MonthlyPoint[];
}

// ---------- Sourcing (AliExpress), analysis level ----------

export interface SourcingProduct {
  readonly title: string;
  readonly priceEur: number;
  readonly orders: number | null;
  readonly rating: number | null;
  readonly url: string;
}

export interface SourcingOffer {
  /** Matching products reported by AliExpress. */
  readonly products: number;
  readonly sampled: number;
  readonly priceEur: { readonly p25: number; readonly median: number; readonly p75: number };
  /** Sum of recent orders over the sample ("lastest_volume"). */
  readonly recentOrders: number | null;
  readonly topProducts: readonly SourcingProduct[];
}

// ---------- Customs classification and import taxes ----------

export interface HsClassification {
  /** Commodity code as published by the tariff (8 or 10 digits), or the code typed by the user. */
  readonly code: string;
  /** First 6 digits: the internationally harmonised part. */
  readonly hs6: string;
  readonly description: string;
  /** user: typed in the form; search: proposed by the tariff search, to be checked. */
  readonly method: "user" | "search";
}

export type TaxRegime = "eu" | "gb" | "us" | "other";

export type DutyBasis = "ad_valorem" | "low_value_flat" | "exempt_low_value" | "customs_union" | "unknown";

export interface ImportTaxes {
  readonly regime: TaxRegime;
  /** Ad valorem duty for this origin, in %. A range when several tariff lines match the HS6 heading. */
  readonly dutyRatePct: { readonly min: number; readonly max: number } | null;
  /** EU temporary flat duty per item on consignments under €150. */
  readonly lowValueDutyEur: number | null;
  /** Standard VAT / GST rate of the destination, in %. Null when the country has no national VAT. */
  readonly vatRatePct: number | null;
  /** Duty actually owed on one unit at the analysed value, in EUR, and why. */
  readonly dutyPerUnitEur: number | null;
  readonly dutyBasis: DutyBasis;
  /** Customs value used for the per-unit duty, in EUR. */
  readonly customsValueEur: number | null;
  /** Rules applied and limits (thresholds, measures not computed), in plain French. */
  readonly notes: readonly string[];
}

// ---------- Country block added to the analysis ----------

export interface CountrySignalsV2 {
  readonly searchSuggestions: Datum<SearchSuggestions>;
  readonly content: Datum<ContentActivity>;
  readonly marketplace: Datum<MarketplaceListings>;
  readonly topicInterest: Datum<TopicInterest>;
  readonly taxes: Datum<ImportTaxes>;
  /**
   * Landed unit cost: supplier price + shipping cost + duty per unit, in EUR, from the owner's inputs.
   * The three fields below are absent from analyses stored before scoring 2026.10-v3.
   */
  readonly landedUnitCostEur?: Datum<number>;
  /** (selling price excl. VAT − landed cost) / selling price excl. VAT, in %, « à ton prix ». */
  readonly marginAtPlannedPrice?: Datum<number>;
  /** Selling price that reaches the owner's target margin: landed / (1 − target). */
  readonly minPriceForTargetMargin?: Datum<MinimumPrice>;
  /** Legacy (before 2026.10-v3): selling price excl. VAT implied by the median eBay price, in EUR. */
  readonly marketPriceExVatEur?: Datum<number>;
  /** Legacy (before 2026.10-v3): sourcing cost + duty per unit, in EUR. */
  readonly unitCostEur?: Datum<number>;
  /** Legacy (before 2026.10-v3): margin at the median eBay price, before advertising. */
  readonly marketMarginPct?: Datum<number>;
}

export interface MinimumPrice {
  /** Minimum selling price excluding VAT, in EUR. */
  readonly exVatEur: number;
  /** Same price including the country's VAT; equals exVatEur without national VAT, null when the rate is unknown. */
  readonly inclVatEur: number | null;
}

export type { Interval };
