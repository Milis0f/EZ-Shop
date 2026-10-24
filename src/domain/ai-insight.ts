import { z } from "zod";
import { COUNTRY_CODES } from "./country";

/**
 * Contract of the local AI reading of a stored analysis.
 *
 * The AI only rewords what the analysis already holds: every number in its
 * text must exist in the fact sheet it was given, otherwise the reading is
 * rejected and never shown. Its product reading is a hypothesis, never data.
 */

export const AI_INSIGHT_METHOD = "local_ai_v1" as const;

export const aiCountryLineSchema = z.object({
  country: z.enum(COUNTRY_CODES),
  sentence: z.string().min(1).max(400),
});

export const aiInsightSchema = z.object({
  /** Two to four French sentences on the whole analysis. */
  summary: z.string().min(1).max(900),
  /** One sentence per analysed country, in the analysis order. */
  countries: z.array(aiCountryLineSchema).max(30),
  /** At most three concrete next steps (sources to connect, inputs to give). */
  nextSteps: z.array(z.string().min(1).max(240)).max(3),
  /** What the product probably is, read from its name only: a hypothesis. */
  productReading: z.object({
    category: z.string().min(1).max(80),
    description: z.string().min(1).max(240),
  }),
});

export type AiInsight = z.infer<typeof aiInsightSchema>;

export const aiModelInfoSchema = z.object({
  name: z.string(),
  license: z.string(),
});

/** Body of `POST /api/analyses/:id/ai` inside the usual `{ success, data, error }` envelope. */
export const aiInsightResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    method: z.literal(AI_INSIGHT_METHOD),
    insight: aiInsightSchema,
    model: aiModelInfoSchema,
    generatedAt: z.string(),
    durationMs: z.number().int().nonnegative(),
    cached: z.boolean(),
  }),
  z.object({
    /** Disabled, model file missing, or the engine failed to load. Nothing is invented in its place. */
    status: z.literal("unavailable"),
    reason: z.string(),
  }),
  z.object({
    /** The model answered but its text failed a check (e.g. a number not in the analysis). */
    status: z.literal("rejected"),
    reason: z.string(),
  }),
]);

export type AiInsightResponse = z.infer<typeof aiInsightResponseSchema>;
