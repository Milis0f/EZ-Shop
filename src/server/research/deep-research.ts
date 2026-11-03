import "server-only";
import { getEnv } from "@/config/env";
import { getCountry, type CountryCode } from "@/domain/country";
import type { DeepEvent, DeepReport, DeepResearchRequest } from "@/domain/deep-research";
import { marginOf } from "@/engine/research/margin";
import type { Locale } from "@/i18n/config";
import { getLocalAiEngine } from "@/server/ai/engine";
import type { EngineLoadResult } from "@/server/ai/types";
import { DEFAULT_FETCH_DEPS } from "@/server/web/safe-fetch";
import { summarisePrices } from "@/server/web/research";
import { digWithTools, writeReport } from "./deep-ai";
import { gather, SourceBook, type GatherDeps } from "./deep-gather";

/**
 * The deep AI research, step by step: the app's own gathering, then the AI's tools, then the report.
 * Each step is reported as it starts, with its real progress, so the planet shows what is happening.
 * It never runs past five minutes: what was found until then makes the report.
 */

export const DEEP_TIME_LIMIT_MS = 5 * 60 * 1000;
/** The tools stop with this much time left, for the report to be written; they never take more than TOOLS_MAX_MS. */
const WRITE_RESERVE_MS = 150_000;
const TOOLS_MAX_MS = 100_000;

export interface DeepDeps extends GatherDeps {
  readonly loadEngine: () => Promise<EngineLoadResult>;
}

const defaultDeps = (): DeepDeps => ({ env: getEnv(), fetch: DEFAULT_FETCH_DEPS, now: () => Date.now(), loadEngine: () => getLocalAiEngine() });

const noteOf = (loaded: EngineLoadResult): DeepReport["aiNote"] => {
  if (loaded.ok) return null;
  const code = loaded.failure?.code;
  return code === "disabled" ? "ai_off" : code === "model_missing" ? "ai_missing" : "ai_failed";
};

export async function runDeepResearch(request: DeepResearchRequest, locale: Locale, emit: (event: DeepEvent) => void, overrides: Partial<DeepDeps> = {}, signal?: AbortSignal): Promise<void> {
  const deps = { ...defaultDeps(), ...overrides };
  const started = deps.now();
  const limit = AbortSignal.timeout(DEEP_TIME_LIMIT_MS);
  const stop = signal ? AbortSignal.any([signal, limit]) : limit;
  const country = getCountry(request.country as CountryCode).nameEn;
  const book = new SourceBook();

  const found = await gather(request.product, locale, book, (event) => emit({ type: "step", ...event }), deps);
  if (!found.ok) {
    emit({ type: "failed", code: found.code });
    return;
  }
  const { gathered } = found;
  const margin = marginOf(request.sellingPrice, request.supplierPrice, request.shippingCost);

  // Loading the model takes a while the first time: the planet says so.
  emit({ type: "step", step: "ai_tools", progress: 0.59, detail: "loading" });
  let loaded: EngineLoadResult;
  try {
    loaded = await deps.loadEngine();
  } catch {
    loaded = { ok: false, reason: "load failed", failure: { code: "load_failed", error: "Error" } };
  }

  let toolCalls: DeepReport["toolCalls"] = [];
  let extraFacts: readonly string[] = [];
  let shops = gathered.shops;
  let prices = gathered.prices;
  let ai: DeepReport["ai"] = null;
  let aiNote = noteOf(loaded);
  if (loaded.ok && !stop.aborted) {
    const engine = loaded.engine;
    emit({ type: "step", step: "ai_tools", progress: 0.6, detail: null });
    const toolMs = Math.max(10_000, Math.min(TOOLS_MAX_MS, DEEP_TIME_LIMIT_MS - WRITE_RESERVE_MS - (deps.now() - started)));
    const toolBudget = AbortSignal.timeout(toolMs);
    let calls = 0;
    const run = await digWithTools(engine, request.product, country, locale, book, deps, (call) => {
      calls += 1;
      emit({ type: "step", step: "ai_tools", progress: Math.min(0.8, 0.6 + 0.033 * calls), detail: `${call.tool}:${call.detail}` });
    }, AbortSignal.any([stop, toolBudget]), toolMs);
    toolCalls = run.calls;
    extraFacts = run.facts;
    shops = [...shops, ...run.shops.filter((shop) => !shops.some((s) => s.domain === shop.domain))];
    prices = [...prices, ...run.prices.filter((p) => !prices.some((q) => q.source === p.source))];
    if (!engine.runWithTools) aiNote = "no_tools";

    emit({ type: "step", step: "ai_write", progress: 0.84, detail: String(book.all().length) });
    // Real clock: the research's own limit, whatever clock the steps were timed with.
    const written = await writeReport(engine, book, { product: request.product, country, prices, shops, margin, extraFacts }, locale, stop, Date.now() + Math.max(30_000, DEEP_TIME_LIMIT_MS - (deps.now() - started)));
    ai = written.ai;
    aiNote = written.note ?? (aiNote === "no_tools" ? "no_tools" : null);
  }

  const report: DeepReport = {
    product: request.product,
    country: request.country,
    sources: [...book.all()],
    prices,
    priceSummary: summarisePrices(prices.map((p) => ({ url: book.get(p.source)?.url ?? "", domain: book.get(p.source)?.domain ?? "", name: p.name, price: p.price, currency: p.currency, rating: p.rating, reviewCount: p.reviewCount }))),
    shops,
    suppliers: gathered.suppliers,
    margin,
    ai,
    aiNote,
    toolCalls,
    model: loaded.ok ? loaded.engine.model.name : null,
    durationMs: Math.round(deps.now() - started),
    cutShort: limit.aborted,
  };
  emit({ type: "step", step: "done", progress: 1, detail: null });
  emit({ type: "report", report });
}
