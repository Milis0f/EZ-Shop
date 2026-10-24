import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The real engine is never imported: no model, no native binary.
vi.mock("./engine", () => ({ getLocalAiEngine: vi.fn(async () => ({ ok: false, reason: "not used in tests" })) }));

import { AI_INSIGHT_METHOD, aiInsightResponseSchema, type AiInsight } from "@/domain/ai-insight";
import type { AnalysisResult } from "@/domain/analysis";
import type { CountryCode } from "@/domain/country";
import { TEST_NOW } from "@/test/fixtures";
import { buildFactSheet } from "./fact-sheet";
import { clearInsightCache, getAnalysisInsight, PROMPT_VERSION, type InsightDeps } from "./insight";
import { mockStoredAnalysis } from "./test-analysis";
import type { AiJsonRequest, EngineLoadResult, LocalAiEngine } from "./types";

const MODEL = { name: "Fake model", license: "Apache-2.0" };

const mockAnalysis = (countries: readonly CountryCode[]): Promise<AnalysisResult> =>
  mockStoredAnalysis(countries, { currency: "EUR", sellingPrice: 29 });

function fakeEngine(answer: (request: AiJsonRequest) => Promise<unknown> | unknown) {
  const completeJson = vi.fn(async (request: AiJsonRequest) => answer(request));
  const engine: LocalAiEngine = { model: MODEL, completeJson };
  const loadEngine = vi.fn(async (): Promise<EngineLoadResult> => ({ ok: true, engine }));
  const deps: InsightDeps = { loadEngine, now: () => TEST_NOW };
  return { completeJson, loadEngine, deps };
}

let analysis: AnalysisResult;
/** Confidence of France as written in the fact sheet: a number the AI may repeat. */
let frConfidence: string;

/** A valid answer that only repeats facts; countries given out of order on purpose. */
const goodAnswer = (): AiInsight => ({
  summary: `Les données sont fictives. La confiance pour la France est de ${frConfidence} sur 100.`,
  countries: [
    { country: "DE", sentence: "Allemagne : données insuffisantes pour conclure." },
    { country: "FR", sentence: "France : à tester prudemment." },
  ],
  nextSteps: ["Brancher eBay pour connaître les prix du marché."],
  productReading: { category: "Textile chauffant", description: "Probablement des chaussettes avec résistance chauffante et batterie." },
});

beforeAll(async () => {
  analysis = await mockAnalysis(["FR", "DE"]);
  frConfidence = String(Math.round(analysis.countries[0].scoring.confidence.score));
});

beforeEach(() => {
  clearInsightCache();
});

describe("getAnalysisInsight", () => {
  it("returns a validated reading in the analysis order, with the model and the duration", async () => {
    const { deps, completeJson } = fakeEngine(goodAnswer);

    const result = await getAnalysisInsight(analysis, deps);

    expect(aiInsightResponseSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({ status: "ready", method: AI_INSIGHT_METHOD, model: MODEL, generatedAt: TEST_NOW.toISOString(), cached: false });
    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.insight.countries.map((c) => c.country)).toEqual(["FR", "DE"]);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const request = completeJson.mock.calls[0][0];
    expect(request.user).toContain("Produit : « Chaussettes chauffantes »");
    expect(request.system).toContain("N'ajoute jamais un chiffre");
    expect(request.maxTokens).toBeGreaterThan(0);
    expect(JSON.stringify(request.schema)).toContain('"enum":["FR","DE"]');
  });

  it("says plainly when the engine cannot run, and invents nothing", async () => {
    const loadEngine = vi.fn(async (): Promise<EngineLoadResult> => ({ ok: false, reason: "IA locale désactivée (LOCAL_AI_ENABLED=false)." }));

    const result = await getAnalysisInsight(analysis, { loadEngine, now: () => TEST_NOW });

    expect(result).toEqual({ status: "unavailable", reason: "IA locale désactivée (LOCAL_AI_ENABLED=false)." });
  });

  it("rejects the whole reading when the AI cites a number absent from the analysis", async () => {
    const { deps } = fakeEngine(() => ({ ...goodAnswer(), summary: "Environ 4 321,77 ventes par mois sont attendues." }));

    const result = await getAnalysisInsight(analysis, deps);

    expect(buildFactSheet(analysis).numbers.has("4321.77")).toBe(false);
    expect(result).toEqual({ status: "rejected", reason: "L'IA a cité un chiffre absent de l'analyse (4 321,77) : texte écarté." });
  });

  it("checks every text field, the next steps and the product reading included", async () => {
    const { deps } = fakeEngine(() => ({ ...goodAnswer(), productReading: { category: "Textile", description: "Vendu environ 19,93 €." } }));

    expect(await getAnalysisInsight(analysis, deps)).toMatchObject({ status: "rejected", reason: expect.stringContaining("(19,93)") });
  });

  it("drops the lines about countries that were not analysed", async () => {
    const { deps } = fakeEngine(() => ({
      ...goodAnswer(),
      countries: [...goodAnswer().countries, { country: "IT", sentence: "Italie : très prometteur." }, { country: "FR", sentence: "Doublon." }],
    }));

    const result = await getAnalysisInsight(analysis, deps);

    if (result.status !== "ready") throw new Error(`expected ready, got ${result.status}`);
    expect(result.insight.countries).toEqual([
      { country: "FR", sentence: "France : à tester prudemment." },
      { country: "DE", sentence: "Allemagne : données insuffisantes pour conclure." },
    ]);
  });

  it("rejects an answer that does not match the schema", async () => {
    const { deps } = fakeEngine(() => ({ summary: "", countries: "FR" }));

    expect(await getAnalysisInsight(analysis, deps)).toEqual({ status: "rejected", reason: "La réponse de l'IA n'a pas le format attendu : texte écarté." });
  });

  it("reports an engine failure as unavailable without leaking the error", async () => {
    const { deps } = fakeEngine(() => {
      throw new Error("secret path C:\\models\\x.gguf");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await getAnalysisInsight(analysis, deps);

    expect(result.status).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("secret path");
    error.mockRestore();
  });

  it("serves a cached reading for the same analysis, and generates again when the analysis changed", async () => {
    const { deps, completeJson } = fakeEngine(goodAnswer);

    const first = await getAnalysisInsight(analysis, deps);
    const second = await getAnalysisInsight(analysis, deps);
    const rerun = await getAnalysisInsight({ ...analysis, completedAt: "2026-10-20T08:00:00.000Z" }, deps);

    expect(first).toMatchObject({ status: "ready", cached: false });
    expect(second).toMatchObject({ status: "ready", cached: true });
    if (first.status === "ready" && second.status === "ready") expect(second.insight).toEqual(first.insight);
    expect(rerun).toMatchObject({ status: "ready", cached: false });
    expect(completeJson).toHaveBeenCalledTimes(2);
    expect(PROMPT_VERSION).toBeTruthy();
  });

  it("does not cache a rejected reading", async () => {
    let calls = 0;
    const { deps, completeJson } = fakeEngine(() => (++calls === 1 ? { ...goodAnswer(), summary: "Prix conseillé : 49,37 €." } : goodAnswer()));

    expect((await getAnalysisInsight(analysis, deps)).status).toBe("rejected");
    expect((await getAnalysisInsight(analysis, deps)).status).toBe("ready");
    expect(completeJson).toHaveBeenCalledTimes(2);
  });

  it("shares one generation between concurrent requests for the same analysis", async () => {
    let release: (value: AiInsight) => void = () => undefined;
    const { deps, completeJson, loadEngine } = fakeEngine(() => new Promise<AiInsight>((resolve) => (release = resolve)));

    const a = getAnalysisInsight(analysis, deps);
    const b = getAnalysisInsight(analysis, deps);
    await vi.waitFor(() => expect(completeJson).toHaveBeenCalledTimes(1));
    release(goodAnswer());
    const [ra, rb] = await Promise.all([a, b]);

    expect(ra).toMatchObject({ status: "ready" });
    expect(rb).toEqual(ra);
    expect(completeJson).toHaveBeenCalledTimes(1);
    expect(loadEngine).toHaveBeenCalledTimes(1);
  });

  it("does not load the model for an analysis that is not completed", async () => {
    const { deps, loadEngine } = fakeEngine(goodAnswer);

    const result = await getAnalysisInsight({ ...analysis, status: "running" }, deps);

    expect(result).toEqual({ status: "unavailable", reason: "L'analyse n'est pas terminée : il n'y a rien à relire." });
    expect(loadEngine).not.toHaveBeenCalled();
  });

  it("writes countries with the same facts once when that is what makes a long analysis fit", async () => {
    const codes: CountryCode[] = ["FR", "BE", "CH", "LU", "DE", "AT", "NL", "ES", "IT", "PT", "IE", "PL", "SE", "DK", "GB", "US", "CA", "AU"];
    // Real analyses of many countries often hold the very same facts (and gaps) in most of them.
    const same: AnalysisResult = { ...analysis, countries: codes.map((country) => ({ ...analysis.countries[0], country })) };
    const { deps, completeJson } = fakeEngine(goodAnswer);

    const result = await getAnalysisInsight(same, deps);

    expect(result.status).toBe("ready");
    const request = completeJson.mock.calls[0][0];
    expect(request.user).toContain("## France (FR), Belgique (BE), Suisse (CH)");
    expect(request.user).toContain(" : mêmes faits pour chacun de ces pays");
    expect(request.user.match(/^## /gm)).toHaveLength(1);
    expect(request.system).toContain("écris quand même une phrase pour chacun");
    expect(JSON.stringify(request.schema)).toContain(`"enum":${JSON.stringify(codes)}`);
  });

  it("does not load the model when the fact sheet cannot fit in its context", async () => {
    const all = await mockAnalysis(["FR", "BE", "CH", "LU", "DE", "AT", "NL", "ES", "IT", "PT", "IE", "PL", "SE", "DK", "GB", "US", "CA", "AU"]);
    const { deps, loadEngine } = fakeEngine(goodAnswer);

    const result = await getAnalysisInsight(all, deps);

    expect(result).toMatchObject({ status: "unavailable", reason: expect.stringContaining("trop longue pour l'IA locale (18 pays") });
    expect(loadEngine).not.toHaveBeenCalled();
  });
});
