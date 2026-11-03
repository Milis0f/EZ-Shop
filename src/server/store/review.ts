import "server-only";
import { z } from "zod";
import { REVIEW_AREAS, REVIEW_PRIORITIES, type ReviewAction, type ReviewResult, type StoreReview } from "@/domain/store";
import type { Locale } from "@/i18n/config";
import { getLocalAiEngine } from "@/server/ai/engine";
import { collectNumbersFor, findUnsupportedNumbers } from "@/server/ai/number-guard";
import type { AiJsonSchema, EngineLoadResult } from "@/server/ai/types";
import { reviewFacts, type ReviewMaterial } from "./review-facts";

/**
 * The local AI's advice on the owner's store, from the fact sheet only. The model has no tools and
 * answers through a JSON grammar; every number it writes must be on the sheet. A refused answer gets
 * one more try told which numbers were wrong; after that, the sentences holding them are dropped.
 */

const LANGUAGE: Readonly<Record<Locale, string>> = { en: "English", fr: "French", es: "Spanish" };
const MAX_TOKENS = 1_100;
const MAX_ATTEMPTS = 2;

const text = (maxLength: number) => ({ type: "string", maxLength });

const SCHEMA: AiJsonSchema = {
  type: "object",
  properties: {
    headline: text(220),
    strengths: { type: "array", items: text(170), maxItems: 3 },
    problems: { type: "array", items: text(190), maxItems: 4 },
    actions: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        properties: { title: text(90), why: text(220), priority: { enum: [...REVIEW_PRIORITIES] }, area: { enum: [...REVIEW_AREAS] } },
        required: ["title", "why", "priority", "area"],
      },
    },
  },
  required: ["headline", "strengths", "problems", "actions"],
};

const answerSchema = z.object({
  headline: z.string(),
  strengths: z.array(z.string()).max(3),
  problems: z.array(z.string()).max(4),
  actions: z.array(z.object({ title: z.string(), why: z.string(), priority: z.enum(REVIEW_PRIORITIES), area: z.enum(REVIEW_AREAS) })).max(4),
});
type Answer = z.infer<typeof answerSchema>;

const systemPrompt = (locale: Locale): string =>
  [
    `You are an e-commerce coach reviewing the owner's own online store. Write in ${LANGUAGE[locale]}, addressing the owner directly and plainly.`,
    "The facts between <data> tags come from the store's Shopify account and ad accounts. Use only them.",
    "Copy every number exactly as written in the facts; never compute, round, add up or estimate a new one. Prefer words when a number is not needed.",
    "Never promise a result. Facts marked as not available are unknown: say what connecting them would show, never guess them.",
    "Few visits or orders mean the figures say little yet: say so instead of drawing firm conclusions.",
    "headline: one sentence of at most 30 words, the main thing to know.",
    "strengths: up to 3 things that work. problems: up to 4 things that hold the store back, the most costly first.",
    "actions: 1 to 4 concrete next steps the owner can do this week, the most useful first. title: an imperative of at most 10 words. why: one sentence tying it to a fact.",
    "priority: high when it blocks sales, medium when it improves them, low otherwise. area: traffic, conversion, ads, catalogue or countries.",
  ].join(" ");

export interface ReviewDeps {
  readonly loadEngine: () => Promise<EngineLoadResult>;
  readonly now: () => Date;
}

const DEFAULT_DEPS: ReviewDeps = { loadEngine: () => getLocalAiEngine(), now: () => new Date() };

function wrongNumbers(answer: Answer, allowed: ReadonlySet<string>, locale: Locale): string[] {
  const written = [answer.headline, ...answer.strengths, ...answer.problems, ...answer.actions.flatMap((a) => [a.title, a.why])];
  return [...new Set(written.flatMap((line) => findUnsupportedNumbers(line, allowed, locale)))];
}

/** Keeps the sentences whose numbers all hold; null when nothing worth showing is left. */
export function keepSupported(answer: Answer, allowed: ReadonlySet<string>, locale: Locale): Answer | null {
  const holds = (line: string) => findUnsupportedNumbers(line, allowed, locale).length === 0;
  const actions: ReviewAction[] = answer.actions.filter((a) => holds(a.title) && holds(a.why));
  const kept = { headline: holds(answer.headline) ? answer.headline : "", strengths: answer.strengths.filter(holds), problems: answer.problems.filter(holds), actions };
  return kept.actions.length > 0 || kept.problems.length > 0 ? kept : null;
}

const tidy = (lines: readonly string[]): string[] => [...new Set(lines.map((line) => line.trim()).filter(Boolean))];

export async function reviewStore(material: ReviewMaterial, locale: Locale, deps: ReviewDeps = DEFAULT_DEPS): Promise<ReviewResult> {
  if (!material.summary && !material.traffic) return { ok: false, code: "no_store" };
  let loaded: EngineLoadResult;
  try {
    loaded = await deps.loadEngine();
  } catch {
    return { ok: false, code: "ai_failed" };
  }
  if (!loaded.ok) {
    const code = loaded.failure?.code;
    // The failure code and the error's name only: never a path or a message.
    console.error("[store] AI review: local AI unavailable", code ?? "unknown", loaded.failure?.code === "load_failed" ? loaded.failure.error : "");
    return { ok: false, code: code === "disabled" ? "ai_off" : code === "model_missing" ? "ai_missing" : "ai_failed" };
  }
  const facts = reviewFacts(material);
  const allowed = collectNumbersFor(locale, [facts]);
  const user = `Review this store and advise its owner.\n\n<data>\n${facts}\n</data>`;
  try {
    let correction = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const raw = await loaded.engine.completeJson({ system: systemPrompt(locale), user: `${user}${correction}`, schema: SCHEMA, maxTokens: MAX_TOKENS });
      const parsed = answerSchema.safeParse(raw);
      if (!parsed.success) continue;
      const wrong = wrongNumbers(parsed.data, allowed, locale);
      const answer = wrong.length === 0 ? parsed.data : attempt === MAX_ATTEMPTS ? keepSupported(parsed.data, allowed, locale) : null;
      if (answer) {
        const review: StoreReview = {
          headline: answer.headline.trim(),
          strengths: tidy(answer.strengths),
          problems: tidy(answer.problems),
          actions: answer.actions.map((a) => ({ ...a, title: a.title.trim(), why: a.why.trim() })),
          used: { sales: material.summary !== null, traffic: material.traffic !== null, meta: material.meta !== null, google: material.google !== null },
          model: loaded.engine.model.name,
          writtenAt: deps.now().toISOString(),
        };
        return { ok: true, review };
      }
      console.error("[store] AI review numbers not in the facts", wrong);
      correction = `\n\nThese numbers are not in the facts, do not write them: ${wrong.join(", ")}.`;
    }
    return { ok: false, code: "ai_rejected" };
  } catch (error: unknown) {
    console.error("[store] AI review failed", error instanceof Error ? error.name : typeof error);
    return { ok: false, code: "ai_failed" };
  }
}
