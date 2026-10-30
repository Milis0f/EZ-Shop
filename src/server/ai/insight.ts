import "server-only";
import { AI_INSIGHT_METHOD, aiInsightSchema, type AiInsight, type AiInsightResponse } from "@/domain/ai-insight";
import type { AnalysisResult } from "@/domain/analysis";
import type { CountryCode } from "@/domain/country";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { formatInt } from "@/i18n/format";
import { messagesFor, type Messages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { t } from "@/i18n/translate";
import { getLocalAiEngine } from "./engine";
import { buildFactSheet, type FactSheet, type FactSheetOptions } from "./fact-sheet";
import { findUnsupportedNumbers } from "./number-guard";
import { PROMPT_WORDS } from "./prompt-words";
import { AiAnswerIncompleteError, type AiJsonSchema, type EngineLoadResult } from "./types";

/**
 * Local AI reading of a stored analysis. The model rewords the fact sheet and nothing else:
 * its answer is validated, every number it writes must exist in the fact sheet, and any failure
 * is reported as such ("unavailable" or "rejected"). Nothing is ever written in its place.
 * The fact sheet, the reading and the reasons are in the visitor's language (the request locale).
 */

/** Bump when the prompt, the schema or the fact sheet changes: cached readings are then regenerated. */
export const PROMPT_VERSION = "insight-v9";

/**
 * Rate limits of `POST /api/analyses/:id/ai` (route files may only export handlers). Every request counts
 * against the first; only a generation that really reaches the model counts against the second (through
 * `admitGeneration`), so cached readings, a disabled AI or a missing model never spend the GPU budget.
 */
export const AI_REQUEST_RATE_LIMIT = { limit: 120, windowMs: 10 * 60_000 } as const;
export const AI_INSIGHT_RATE_LIMIT = { limit: 20, windowMs: 10 * 60_000 } as const;

export type GenerationAdmission = { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

export interface InsightDeps {
  readonly loadEngine: () => Promise<EngineLoadResult>;
  readonly now: () => Date;
  /** Asked right before the model runs (the engine is loaded and the sheet fits): the GPU budget. */
  readonly admitGeneration?: () => GenerationAdmission;
  /** Language of the reading; the request locale (cookie, then Accept-Language) when absent. */
  readonly locale?: Locale;
}

/** Thrown when `admitGeneration` refuses: the caller answers 429. Shared by concurrent waiters, never cached. */
export class GenerationRateLimitedError extends Error {
  override readonly name = "GenerationRateLimitedError";
  constructor(readonly retryAfterSeconds: number) {
    super("Too many AI generations.");
  }
}

const DEFAULT_DEPS: InsightDeps = { loadEngine: () => getLocalAiEngine(), now: () => new Date() };

type ReadyInsight = Extract<AiInsightResponse, { status: "ready" }>;

const MAX_CACHED = 100;
/** Attempts when the answer cites a number the sheet does not hold. */
const MAX_NUMBER_ATTEMPTS = 2;
/** Context of the engine (CONTEXT_SIZE in engine.ts): system prompt, fact sheet and answer must fit in it. */
const CONTEXT_TOKENS = 8_192;
/** System prompt, chat template and the closing instruction, with room to spare. */
const RESERVED_TOKENS = 700;
/**
 * Measured with the Qwen3.5 tokenizer on a French fact sheet: about 3.1 characters per token. Kept lower to
 * stay safe; English packs more characters into a token and Spanish is close to French.
 */
const CHARS_PER_TOKEN = 2.9;

const userPrompt = (sheet: FactSheet): string => `${sheet.text}\n\n${PROMPT_WORDS[sheet.locale].closing}`;

/** Grammar for node-llama-cpp: no anyOf, no pattern; closed sets as enums. `required` is not enforced, Zod checks after. */
function insightJsonSchema(countries: readonly CountryCode[]): AiJsonSchema {
  const text = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
  return {
    type: "object",
    properties: {
      summary: text(900),
      countries: {
        type: "array",
        minItems: countries.length,
        maxItems: countries.length,
        items: { type: "object", properties: { country: { enum: [...countries] }, sentence: text(400) } },
      },
      nextSteps: { type: "array", minItems: 1, maxItems: 3, items: text(240) },
      productReading: { type: "object", properties: { category: text(80), description: text(240) } },
    },
  };
}

/** Room for the summary, one sentence per country, three steps and the product reading. */
const maxTokensFor = (countryCount: number): number => Math.min(3_200, 650 + 140 * countryCount);

/** Shortest last: full sheet, brief sheet, brief sheet with countries of identical facts written once. */
const SHEET_LEVELS: readonly FactSheetOptions[] = [{}, { brief: true }, { brief: true, groupSameCountries: true }];

/** The longest fact sheet that fits in the context with the answer, else null. */
function fittingFactSheet(analysis: AnalysisResult, maxTokens: number, locale: Locale): FactSheet | null {
  for (const options of SHEET_LEVELS) {
    const sheet = buildFactSheet(analysis, { ...options, locale });
    if (Math.ceil(sheet.text.length / CHARS_PER_TOKEN) + RESERVED_TOKENS + maxTokens <= CONTEXT_TOKENS) return sheet;
  }
  return null;
}

interface InsightStore {
  readonly cache: Map<string, ReadyInsight>;
  readonly inFlight: Map<string, Promise<AiInsightResponse>>;
}

// Kept on globalThis so a dev hot reload does not throw away readings that took a minute to write.
const STORE_KEY = Symbol.for("ez-shop.ai-insight-store");
const globalForStore = globalThis as unknown as { [STORE_KEY]?: InsightStore };

function store(): InsightStore {
  globalForStore[STORE_KEY] ??= { cache: new Map(), inFlight: new Map() };
  return globalForStore[STORE_KEY];
}

/** Forgets every cached reading and every generation in flight (tests). */
export function clearInsightCache(): void {
  store().cache.clear();
  store().inFlight.clear();
}

const insightKey = (analysis: AnalysisResult, locale: Locale): string =>
  `${analysis.id}|${analysis.completedAt ?? ""}|${locale}|${PROMPT_VERSION}`;

function remember(key: string, value: ReadyInsight): void {
  const { cache } = store();
  cache.delete(key);
  cache.set(key, value);
  // Oldest first in insertion order.
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** One line per analysed country, first one kept, in the analysis order. Lines about other countries are dropped. */
function keepAnalysedCountries(insight: AiInsight, codes: readonly CountryCode[]): AiInsight {
  const byCountry = new Map<CountryCode, AiInsight["countries"][number]>();
  for (const line of insight.countries) {
    if (codes.includes(line.country) && !byCountry.has(line.country)) byCountry.set(line.country, line);
  }
  return { ...insight, countries: codes.flatMap((code) => byCountry.get(code) ?? []) };
}

const textsOf = (insight: AiInsight): string[] => [
  insight.summary,
  ...insight.countries.map((c) => c.sentence),
  ...insight.nextSteps,
  insight.productReading.category,
  insight.productReading.description,
];

/** Analysed countries the model wrote no line for (it may repeat one country and skip another). */
const missingFrom = (insight: AiInsight, codes: readonly CountryCode[]): CountryCode[] =>
  codes.filter((code) => !insight.countries.some((line) => line.country === code));

const unavailable = (reason: string): AiInsightResponse => ({ status: "unavailable", reason });
const rejected = (reason: string): AiInsightResponse => ({ status: "rejected", reason });

type Reasons = Messages<"ai">["reasons"];

/** The engine's failure in the reading's language; a result without a code keeps its own reason. */
function engineReason(loaded: Extract<EngineLoadResult, { ok: false }>, reasons: Reasons): string {
  const failure = loaded.failure;
  switch (failure?.code) {
    case "disabled":
      return reasons.disabled;
    case "model_missing":
      return t(reasons.modelMissing, { file: failure.file });
    case "load_failed":
      return t(reasons.loadFailed, { error: failure.error });
    case "stuck":
      return reasons.stuck;
    default:
      return loaded.reason;
  }
}

async function generate(analysis: AnalysisResult, deps: InsightDeps, locale: Locale): Promise<AiInsightResponse> {
  const started = performance.now();
  const reasons = messagesFor("ai", locale).reasons;
  const codes = analysis.countries.map((c) => c.country);
  const maxTokens = maxTokensFor(codes.length);
  // Checked before loading the model: no need to fill the GPU for a reading that cannot fit.
  const sheet = fittingFactSheet(analysis, maxTokens, locale);
  if (!sheet) return unavailable(t(reasons.tooLong, { count: formatInt(codes.length, locale) }));

  let loaded: EngineLoadResult;
  try {
    loaded = await deps.loadEngine();
  } catch (error: unknown) {
    console.error("[ai] engine load threw", error instanceof Error ? error.name : typeof error);
    return unavailable(reasons.engineStart);
  }
  if (!loaded.ok) return unavailable(engineReason(loaded, reasons));

  const admission = deps.admitGeneration?.() ?? { allowed: true };
  if (!admission.allowed) throw new GenerationRateLimitedError(admission.retryAfterSeconds);

  let insight: AiInsight | undefined;
  let correction = "";
  // A rounded or misquoted figure gets one more try, told which one; the guard stays the judge.
  for (let attempt = 1; attempt <= MAX_NUMBER_ATTEMPTS && !insight; attempt += 1) {
    let raw: unknown;
    try {
      raw = await loaded.engine.completeJson({
        system: PROMPT_WORDS[locale].system,
        user: `${userPrompt(sheet)}${correction}`,
        schema: insightJsonSchema(codes),
        maxTokens,
      });
    } catch (error: unknown) {
      if (error instanceof AiAnswerIncompleteError) return rejected(reasons.incomplete);
      console.error("[ai] insight generation failed", error instanceof Error ? error.name : typeof error);
      return unavailable(reasons.generationFailed);
    }

    const parsed = aiInsightSchema.safeParse(raw);
    if (!parsed.success) return rejected(reasons.badFormat);

    const candidate = keepAnalysedCountries(parsed.data, codes);
    const unsupported = textsOf(candidate).flatMap((text) => findUnsupportedNumbers(text, sheet.numbers, sheet.locale));
    if (unsupported.length === 0) {
      insight = candidate;
    } else {
      // The figure itself stays in the server log: shown in the UI, the invented number would still reach the screen.
      console.warn(`[ai] insight rejected, unsupported numbers: ${unsupported.slice(0, 5).join(", ")}`);
      correction = `\n\nThese numbers are not in the sheet, do not write them: ${unsupported.slice(0, 10).join(", ")}. Copy every number exactly as the sheet writes it, or leave it out.`;
    }
  }
  if (!insight) return rejected(reasons.unsupportedNumber);

  return {
    status: "ready",
    method: AI_INSIGHT_METHOD,
    insight,
    model: { name: loaded.engine.model.name, license: loaded.engine.model.license },
    generatedAt: deps.now().toISOString(),
    durationMs: Math.max(0, Math.round(performance.now() - started)),
    cached: false,
    missingCountries: missingFrom(insight, codes),
  };
}

/** The request locale. Outside a request (scripts, tests) there is no cookie nor header to read: English. */
async function requestLocale(): Promise<Locale> {
  try {
    return await getLocale();
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * AI reading of a completed analysis, in `overrides.locale` or else the request locale. Successful
 * readings are cached per analysis, completion time, locale and prompt version; concurrent requests
 * for the same reading share one generation.
 */
export async function getAnalysisInsight(analysis: AnalysisResult, overrides: Partial<InsightDeps> = {}): Promise<AiInsightResponse> {
  const deps: InsightDeps = { ...DEFAULT_DEPS, ...overrides };
  const locale = deps.locale ?? (await requestLocale());
  const reasons = messagesFor("ai", locale).reasons;
  if (analysis.status === "failed") return unavailable(reasons.analysisFailed);
  if (analysis.status !== "completed") return unavailable(reasons.analysisNotDone);

  const key = insightKey(analysis, locale);
  const { cache, inFlight } = store();
  const hit = cache.get(key);
  if (hit) return { ...hit, cached: true };

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise: Promise<AiInsightResponse> = generate(analysis, deps, locale)
    .then((result) => {
      if (result.status === "ready" && inFlight.get(key) === promise) remember(key, result);
      return result;
    })
    .finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}
