import { z } from "zod";
import { COUNTRY_CODES } from "./country";
import { WEB_AI_NOTES } from "./web";

/**
 * The deep AI research: the app gathers the web pages, shops and marketplaces about a product, then the
 * local AI digs further with a few tools and writes a report where every point cites its sources. The
 * figures come from the pages; the margin is a calculation; the AI's text is checked against both.
 */

const optionalPrice = z.number().positive().max(1_000_000).optional();

export const deepResearchRequestSchema = z.object({
  product: z.string().trim().min(2).max(120),
  country: z.enum(COUNTRY_CODES),
  sellingPrice: optionalPrice,
  supplierPrice: optionalPrice,
  shippingCost: z.number().nonnegative().max(100_000).optional(),
});
export type DeepResearchRequest = z.infer<typeof deepResearchRequestSchema>;

export const DEEP_SOURCE_KINDS = ["page", "shop", "marketplace", "search"] as const;

/** A numbered source: the report's points cite these numbers. */
export const deepSourceSchema = z.object({
  n: z.number().int().positive(),
  url: z.string(),
  title: z.string(),
  domain: z.string(),
  kind: z.enum(DEEP_SOURCE_KINDS),
  /** The page itself was read, not only its search snippet. */
  read: z.boolean(),
  /** Found by the AI with a tool, not by the app's own search. */
  byAi: z.boolean(),
});
export type DeepSource = z.infer<typeof deepSourceSchema>;

/** A price a page states for the product, in its own product data. */
export const deepPriceSchema = z.object({
  source: z.number().int().positive(),
  name: z.string(),
  price: z.number().positive(),
  currency: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().int().nullable(),
});
export type DeepPrice = z.infer<typeof deepPriceSchema>;

/** A Shopify shop met on the way, read from its own public catalogue. */
export const deepShopSchema = z.object({
  source: z.number().int().positive(),
  domain: z.string(),
  name: z.string().nullable(),
  country: z.string().nullable(),
  productCount: z.number().int().nullable(),
  /** Its product closest to the one searched, by name. */
  match: z.object({ title: z.string(), url: z.string(), price: z.number().nullable(), compareAt: z.number().nullable() }).nullable(),
});
export type DeepShop = z.infer<typeof deepShopSchema>;

export const deepMarginSchema = z.object({
  sellingPrice: z.number(),
  landedCost: z.number(),
  margin: z.number(),
  marginPct: z.number(),
  /** The margin at other selling prices, to see where it breaks even. */
  byPrice: z.array(z.object({ price: z.number(), marginPct: z.number() })),
});
export type DeepMargin = z.infer<typeof deepMarginSchema>;

export const DEEP_SECTIONS = ["market", "competitors", "pricing", "suppliers", "risks"] as const;

const citedSchema = z.object({ text: z.string(), sources: z.array(z.number().int().positive()) });

export const deepAiSchema = z.object({
  summary: z.string(),
  sections: z.array(z.object({ id: z.enum(DEEP_SECTIONS), points: z.array(citedSchema) })),
  actions: z.array(z.object({ title: z.string(), why: z.string(), sources: z.array(z.number().int().positive()) })),
});
export type DeepAi = z.infer<typeof deepAiSchema>;

export const deepToolCallSchema = z.object({ tool: z.string(), input: z.string(), ok: z.boolean() });

export const deepReportSchema = z.object({
  product: z.string(),
  country: z.string(),
  sources: z.array(deepSourceSchema),
  prices: z.array(deepPriceSchema),
  priceSummary: z.object({ currency: z.string(), count: z.number().int(), min: z.number(), median: z.number(), max: z.number() }).nullable(),
  shops: z.array(deepShopSchema),
  suppliers: z.array(z.number().int().positive()),
  margin: deepMarginSchema.nullable(),
  ai: deepAiSchema.nullable(),
  aiNote: z.enum([...WEB_AI_NOTES, "no_tools"]).nullable(),
  toolCalls: z.array(deepToolCallSchema),
  model: z.string().nullable(),
  durationMs: z.number().int().nonnegative(),
  /** The research stopped at its time limit: what was gathered until then is shown. */
  cutShort: z.boolean(),
});
export type DeepReport = z.infer<typeof deepReportSchema>;

export const DEEP_STEPS = ["search", "read", "shops", "suppliers", "ai_tools", "ai_write", "done"] as const;
export type DeepStep = (typeof DEEP_STEPS)[number];

export const DEEP_FAILURES = ["search_not_installed", "search_failed", "no_results"] as const;

/** One line of the stream: a step with its progress, then the report or a failure. */
export const deepEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("step"), step: z.enum(DEEP_STEPS), progress: z.number().min(0).max(1), detail: z.string().nullable() }),
  z.object({ type: z.literal("report"), report: deepReportSchema }),
  z.object({ type: z.literal("failed"), code: z.enum(DEEP_FAILURES) }),
  /** The report was kept in the history under this id. */
  z.object({ type: z.literal("saved"), id: z.string().uuid() }),
]);
export type DeepEvent = z.infer<typeof deepEventSchema>;
