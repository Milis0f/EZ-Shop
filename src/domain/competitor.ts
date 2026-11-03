import { z } from "zod";

/**
 * The deep competitor report, beyond the page itself: what a Shopify shop publishes about itself, its
 * best sellers, the age and popularity of its domain from public registries, its ads, a sales estimate
 * and the changes seen between two readings. Each part says where it comes from; estimates are kept
 * apart from observed facts and carry their assumptions.
 */

/** The shop's own card (`/meta.json` on Shopify). */
export const shopProfileSchema = z.object({
  name: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  currency: z.string().nullable(),
  description: z.string().nullable(),
  shipsTo: z.array(z.string()),
  /** Products the shop has published, all of them: the catalogue read may stop before. */
  productCount: z.number().int().nullable(),
  collectionCount: z.number().int().nullable(),
  installments: z.boolean().nullable(),
});
export type ShopProfile = z.infer<typeof shopProfileSchema>;

/** A product in the order of the shop's "best selling" sort, which Shopify computes from its sales. */
export const bestSellerSchema = z.object({
  rank: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  price: z.number().nullable(),
  available: z.boolean().nullable(),
  /** The product the check was asked for. */
  checked: z.boolean(),
});
export type BestSeller = z.infer<typeof bestSellerSchema>;

export const domainSignalsSchema = z.object({
  /** Registration of the domain name (RDAP). */
  registeredAt: z.string().nullable(),
  /** First page of the domain kept by the Internet Archive. */
  firstArchivedAt: z.string().nullable(),
  /** Months in which the Internet Archive kept a page of the domain. */
  archivedMonths: z.number().int().nullable(),
  /** Rank in the Tranco list of the most visited sites (1 is the most visited); null when outside it or not read. */
  trancoRank: z.number().int().nullable(),
  /** The Tranco list was read and the domain is not among its million sites. */
  outsideTranco: z.boolean(),
  /** Rank a month earlier, to show a trend. */
  trancoRankBefore: z.number().int().nullable(),
});
export type DomainSignals = z.infer<typeof domainSignalsSchema>;

export const SOCIAL_NETWORKS = ["instagram", "tiktok", "facebook", "youtube", "pinterest", "x", "snapchat"] as const;

export const shopPresenceSchema = z.object({
  social: z.array(z.object({ network: z.enum(SOCIAL_NETWORKS), url: z.string() })),
  theme: z.object({ name: z.string().nullable(), schema: z.string().nullable(), version: z.string().nullable() }).nullable(),
  /** Languages the shop offers its pages in (hreflang). */
  languages: z.array(z.string()),
  collections: z.array(z.object({ title: z.string(), count: z.number().int().nullable() })),
});
export type ShopPresence = z.infer<typeof shopPresenceSchema>;

export const AD_LIBRARY_STATES = ["done", "not_configured", "outside_eu", "failed"] as const;

export const adLibrarySchema = z.object({
  state: z.enum(AD_LIBRARY_STATES),
  term: z.string().nullable(),
  country: z.string().nullable(),
  activeAds: z.number().int().nullable(),
  advertisers: z.number().int().nullable(),
  /** Counts stopped at the reading limit: at least this many. */
  truncated: z.boolean(),
});
export type AdLibrary = z.infer<typeof adLibrarySchema>;

/** Assumed share of buyers who leave a review, for the low, middle and high estimate. */
export const REVIEW_RATES = { p10: 0.05, p50: 0.02, p90: 0.01 } as const;

const range = z.object({ p10: z.number(), p50: z.number(), p90: z.number() });

export const ESTIMATE_CAUTIONS = ["few_reviews", "imported_reviews", "young", "price_assumed", "age_from_domain"] as const;

export const salesEstimateSchema = z.object({
  /** product: this product's reviews; shop: the reviews of the whole shop. */
  basis: z.enum(["product", "shop"]),
  reviews: z.number().int().nonnegative(),
  /** Months the reviews were gathered over, and where that age comes from. */
  months: z.number().positive(),
  ageFrom: z.enum(["product_published", "domain_registered", "first_archived", "oldest_product"]),
  /** Buyers since the start: reviews ÷ review rate. */
  total: range,
  perMonth: range,
  /** Revenue a month: buyers a month × price. Null without a price. */
  revenuePerMonth: range.nullable(),
  price: z.number().nullable(),
  currency: z.string().nullable(),
  confidence: z.enum(["low", "medium"]),
  cautions: z.array(z.enum(ESTIMATE_CAUTIONS)),
});
export type SalesEstimate = z.infer<typeof salesEstimateSchema>;

/** Changes between the previous reading of the same shop and this one. */
export const shopChangesSchema = z.object({
  previousAt: z.string(),
  /** Products present in both readings. */
  compared: z.number().int(),
  added: z.number().int(),
  removed: z.number().int(),
  /** Sizes or colours that were in stock and are now sold out: at least one sale each, or a withdrawal. */
  soldOut: z.number().int(),
  restocked: z.number().int(),
  priceUp: z.number().int(),
  priceDown: z.number().int(),
  /** The products whose sizes sold out the most. */
  movers: z.array(z.object({ title: z.string(), url: z.string(), soldOut: z.number().int() })),
});
export type ShopChanges = z.infer<typeof shopChangesSchema>;

export const shopWatchSchema = z.object({
  /** First reading of this shop kept on this computer. */
  firstSeenAt: z.string(),
  readings: z.number().int().positive(),
  changes: shopChangesSchema.nullable(),
});
export type ShopWatch = z.infer<typeof shopWatchSchema>;

export const SOURCE_IDS = ["page", "product", "profile", "catalogue", "best_sellers", "collections", "storefront", "rdap", "archive", "tranco", "ad_library", "suppliers"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];
export const SOURCE_STATES = ["read", "partial", "refused", "limited", "absent", "skipped"] as const;

/**
 * What a Shopify shop's official Storefront API shows without a token: currencies, languages and
 * countries it sells in, its best-selling order, and the price of the checked product in a few of its
 * countries, in their currency. Observed offer on the day, never a sale.
 */
export const shopStorefrontSchema = z.object({
  apiVersion: z.string(),
  baseCurrency: z.string().nullable(),
  currencies: z.array(z.string()),
  languages: z.array(z.string()),
  countries: z.array(z.string()),
  bestSellers: z.array(z.object({ title: z.string(), handle: z.string(), available: z.boolean(), priceMin: z.number().nullable(), currency: z.string().nullable() })),
  prices: z.array(z.object({ country: z.string(), currency: z.string(), min: z.number(), max: z.number(), compareAtMax: z.number().nullable(), available: z.boolean() })),
});
export type ShopStorefront = z.infer<typeof shopStorefrontSchema>;

/** Every source the check tried, so a gap in the report can be traced to its cause. */
export const sourceUseSchema = z.object({ id: z.enum(SOURCE_IDS), state: z.enum(SOURCE_STATES) });
export type SourceUse = z.infer<typeof sourceUseSchema>;
