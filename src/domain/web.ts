import { z } from "zod";

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

export const webSummarySchema = z.object({
  summary: z.string().min(1).max(900),
  keyPoints: z.array(z.string().min(1).max(240)).max(5),
});
export type WebSummary = z.infer<typeof webSummarySchema>;

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
    sources: z.array(webSourceSchema),
    reading: webReadingSchema,
    durationMs: z.number().int().nonnegative(),
  }),
  z.object({ status: z.literal("unavailable"), code: z.enum(WEB_SEARCH_FAILURES) }),
]);
export type WebResearchResponse = z.infer<typeof webResearchResponseSchema>;

export const competitorRequestSchema = z.object({
  url: z.string().trim().min(4).max(2000),
  searchSupplier: z.boolean().default(false),
});

/** Why a page was not read. */
export const COMPETITOR_FAILURES = ["invalid_url", "private_address", "robots", "http_error", "not_a_page", "too_large", "unreachable"] as const;
export type CompetitorFailure = (typeof COMPETITOR_FAILURES)[number];

export const SIGNAL_CODES = ["dropship_app", "long_delivery", "marketplace_copy"] as const;
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
});
export type CompetitorObserved = z.infer<typeof competitorObservedSchema>;

export const competitorResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    url: z.string(),
    domain: z.string(),
    platform: z.enum(["shopify", "other"]),
    observed: competitorObservedSchema,
    apps: z.array(z.string()),
    signals: z.array(z.enum(SIGNAL_CODES)),
    /** Null: the search was not asked for, or failed. */
    suppliers: z.array(webSourceSchema).nullable(),
    supplierSearch: z.enum(["done", "not_asked", ...WEB_SEARCH_FAILURES]),
    reading: webReadingSchema,
    durationMs: z.number().int().nonnegative(),
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
});
export type AiInstallStatus = z.infer<typeof aiInstallStatusSchema>;
