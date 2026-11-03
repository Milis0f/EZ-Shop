import { z } from "zod";
import { adLibrarySchema, bestSellerSchema, domainSignalsSchema, salesEstimateSchema, shopPresenceSchema, shopProfileSchema, shopWatchSchema, sourceUseSchema } from "./competitor";

/**
 * Contracts of the web features. Everything found on the web stays apart from the analysis: it never
 * enters a score or a verdict. Page facts are observed, deductions are hypotheses, and sales are
 * never estimated.
 */

export const webResearchRequestSchema = z.object({
  query: z.string().trim().min(2).max(200),
});

export const webSourceSchema = z.object({
  url: z.string(),
  title: z.string(),
  snippet: z.string(),
  /** The page itself was read; otherwise only the search snippet is known. */
  read: z.boolean(),
});
export type WebSource = z.infer<typeof webSourceSchema>;

export const WEB_AI_NOTES = ["ai_off", "ai_missing", "ai_failed", "ai_rejected"] as const;
export type WebAiNote = (typeof WEB_AI_NOTES)[number];

/** `source`: number of the page read (1 is the first), so that every figure can be checked there. */
export const webStatSchema = z.object({
  label: z.string().min(1).max(80),
  value: z.string().min(1).max(40),
  source: z.number().int().min(1),
});
export type WebStat = z.infer<typeof webStatSchema>;

export const webTableSchema = z.object({
  title: z.string().max(100),
  columns: z.array(z.string().max(40)).max(4),
  rows: z.array(z.object({ cells: z.array(z.string().max(60)).max(4), source: z.number().int().min(1) })).max(6),
});
export type WebTable = z.infer<typeof webTableSchema>;

export const webChartSchema = z.object({
  title: z.string().max(100),
  unit: z.string().max(20),
  points: z.array(z.object({ label: z.string().max(50), value: z.number().finite().nonnegative(), source: z.number().int().min(1) })).max(8),
});
export type WebChart = z.infer<typeof webChartSchema>;

export const webSummarySchema = z.object({
  /** Empty when only the figures passed the check. */
  summary: z.string().max(300),
  keyPoints: z.array(z.string().min(1).max(160)).max(3),
  stats: z.array(webStatSchema).max(4).default([]),
  tables: z.array(webTableSchema).max(1).default([]),
  charts: z.array(webChartSchema).max(1).default([]),
});
export type WebSummary = z.infer<typeof webSummarySchema>;

/** A price a page declares in its product data, read without the AI. */
export const webPagePriceSchema = z.object({
  url: z.string(),
  domain: z.string(),
  name: z.string(),
  price: z.number().nonnegative(),
  currency: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().int().nullable(),
});
export type WebPagePrice = z.infer<typeof webPagePriceSchema>;

/** Calculated from the pages that state a price in the most frequent currency. */
export const webPriceSummarySchema = z.object({
  currency: z.string(),
  count: z.number().int().positive(),
  min: z.number(),
  median: z.number(),
  max: z.number(),
});
export type WebPriceSummary = z.infer<typeof webPriceSummarySchema>;

/** The AI's reading, or why there is none: the facts and links are shown either way. */
export const webReadingSchema = z.object({
  summary: webSummarySchema.nullable(),
  note: z.enum(WEB_AI_NOTES).nullable(),
});
export type WebReading = z.infer<typeof webReadingSchema>;

export const WEB_SEARCH_FAILURES = ["search_not_installed", "search_failed", "no_results"] as const;
export type WebSearchFailure = (typeof WEB_SEARCH_FAILURES)[number];

export const webResearchResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    query: z.string(),
    /** The pages given to the AI come first, in order: a figure's `source` n is `sources[n - 1]`. */
    sources: z.array(webSourceSchema),
    prices: z.array(webPagePriceSchema),
    priceSummary: webPriceSummarySchema.nullable(),
    reading: webReadingSchema,
    durationMs: z.number().int().nonnegative(),
  }),
  z.object({ status: z.literal("unavailable"), code: z.enum(WEB_SEARCH_FAILURES) }),
]);
export type WebResearchResponse = z.infer<typeof webResearchResponseSchema>;

export const competitorRequestSchema = z.object({
  url: z.string().trim().min(4).max(2000),
  searchSupplier: z.boolean().default(false),
  /** Also look up the domain's age and popularity, its ads and the web for suppliers: slower. */
  deep: z.boolean().default(true),
});

/** Why a page was not read. */
export const COMPETITOR_FAILURES = ["invalid_url", "private_address", "robots", "http_error", "rate_limited", "not_a_page", "too_large", "unreachable"] as const;
export type CompetitorFailure = (typeof COMPETITOR_FAILURES)[number];

export const SIGNAL_CODES = ["dropship_app", "long_delivery", "marketplace_copy", "price_sync", "young_domain"] as const;
export type SignalCode = (typeof SIGNAL_CODES)[number];

/** What the page says. A field the page does not state stays null: it is never guessed. */
export const competitorObservedSchema = z.object({
  name: z.string().nullable(),
  vendor: z.string().nullable(),
  priceMin: z.number().nullable(),
  priceMax: z.number().nullable(),
  currency: z.string().nullable(),
  variants: z.number().int().nullable(),
  variantsInStock: z.number().int().nullable(),
  publishedAt: z.string().nullable(),
  reviewCount: z.number().int().nullable(),
  rating: z.number().nullable(),
  image: z.string().nullable(),
  deliveryText: z.string().nullable(),
  /** Crossed-out price, when the shop states one. */
  compareAtPrice: z.number().nullable(),
  productType: z.string().nullable(),
  /** For the whole shop, not for this product. */
  shopRating: z.number().nullable(),
  shopReviewCount: z.number().int().nullable(),
  variantRows: z.array(z.object({ title: z.string(), price: z.number().nullable(), available: z.boolean().nullable() })),
});
export type CompetitorObserved = z.infer<typeof competitorObservedSchema>;

/** What a Shopify shop publishes about its products. The count stops at one page of its catalogue. */
export const shopCatalogueSchema = z.object({
  counted: z.number().int().nonnegative(),
  /** More products may exist beyond those read. */
  capped: z.boolean(),
  priceMin: z.number().nullable(),
  priceMedian: z.number().nullable(),
  priceMax: z.number().nullable(),
  priceBands: z.array(z.object({ from: z.number(), to: z.number(), count: z.number().int() })),
  brands: z.array(z.object({ name: z.string(), count: z.number().int() })),
  discounted: z.number().int(),
  inStock: z.number().int(),
  addedLast90Days: z.number().int(),
  oldestPublishedAt: z.string().nullable(),
  newest: z.array(z.object({ title: z.string(), url: z.string(), price: z.number().nullable(), publishedAt: z.string().nullable() })),
  /** Pages of the catalogue read, of 250 products at most each. */
  pagesRead: z.number().int().nonnegative().default(1),
  types: z.array(z.object({ name: z.string(), count: z.number().int() })).default([]),
  tags: z.array(z.object({ name: z.string(), count: z.number().int() })).default([]),
  /** Average reduction of the discounted products, 0 to 1. */
  discountAverage: z.number().nullable().default(null),
  /** Products with every size or colour sold out. */
  soldOut: z.number().int().default(0),
  /** Products added each month over the last 12 months (YYYY-MM), from their publication date. */
  launchesByMonth: z.array(z.object({ month: z.string(), count: z.number().int() })).default([]),
  /** Products changed in the last 24 hours and 7 days, by their update date. */
  updated24h: z.number().int().default(0),
  updated7d: z.number().int().default(0),
  /** Nearly every product changed in the last day: an app syncs prices or stock, so updates say nothing of sales. */
  autoUpdated: z.boolean().default(false),
});
export type ShopCatalogue = z.infer<typeof shopCatalogueSchema>;

export const competitorResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    url: z.string(),
    domain: z.string(),
    platform: z.enum(["shopify", "other"]),
    /** A home page or a list describes no single product: its facts are never shown as a product's. */
    pageKind: z.enum(["product", "not_product"]),
    observed: competitorObservedSchema,
    catalogue: shopCatalogueSchema.nullable(),
    /** Product pages linked from a page that is not one. */
    productLinks: z.array(z.string()),
    /** The shop refused some reads for now: what is missing may exist, so trying later can help. */
    limited: z.boolean(),
    apps: z.array(z.string()),
    signals: z.array(z.enum(SIGNAL_CODES)),
    /** Null: the search was not asked for, or failed. */
    suppliers: z.array(webSourceSchema).nullable(),
    supplierSearch: z.enum(["done", "not_asked", ...WEB_SEARCH_FAILURES]),
    reading: webReadingSchema,
    durationMs: z.number().int().nonnegative(),
    profile: shopProfileSchema.nullable().default(null),
    bestSellers: z.array(bestSellerSchema).default([]),
    /** sort: Shopify's best-selling sort; collection: the shop's own best-sellers collection, in its order. */
    bestSellersFrom: z.enum(["sort", "collection"]).nullable().default(null),
    /** The title of that collection. */
    bestCollection: z.string().nullable().default(null),
    domainSignals: domainSignalsSchema.nullable().default(null),
    presence: shopPresenceSchema.nullable().default(null),
    adLibrary: adLibrarySchema.nullable().default(null),
    /** This product's sales, then the whole shop's, estimated from their reviews. */
    estimates: z.object({ product: salesEstimateSchema.nullable(), shop: salesEstimateSchema.nullable() }).default({ product: null, shop: null }),
    watch: shopWatchSchema.nullable().default(null),
    sources: z.array(sourceUseSchema).default([]),
  }),
  z.object({ status: z.literal("blocked"), code: z.enum(COMPETITOR_FAILURES) }),
]);
export type CompetitorResponse = z.infer<typeof competitorResponseSchema>;

export const AI_INSTALL_STATES = ["disabled", "installed", "missing", "downloading", "verifying", "failed"] as const;
export const AI_INSTALL_ERRORS = ["disk_full", "network", "checksum", "write"] as const;

export const aiInstallStatusSchema = z.object({
  state: z.enum(AI_INSTALL_STATES),
  downloadedBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative(),
  error: z.enum(AI_INSTALL_ERRORS).nullable(),
  /** Catalogue id of the configured model; null for a file of the owner's own. */
  model: z.string().nullable().optional(),
  /** The download running or last stopped, whichever model it is for (another one than the configured model included). */
  download: z
    .object({
      model: z.string().nullable(),
      phase: z.enum(["downloading", "verifying", "failed"]),
      downloadedBytes: z.number().nonnegative(),
      totalBytes: z.number().nonnegative(),
      error: z.enum(AI_INSTALL_ERRORS).nullable(),
    })
    .nullable()
    .optional(),
});
export type AiInstallStatus = z.infer<typeof aiInstallStatusSchema>;
