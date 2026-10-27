import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The real engine is never imported: no model, no native binary.
vi.mock("./engine", () => ({ getLocalAiEngine: vi.fn(async () => ({ ok: false, reason: "not used in tests" })) }));

import { AI_INSIGHT_METHOD, aiInsightResponseSchema, type AiInsight } from "@/domain/ai-insight";
import type { AnalysisResult } from "@/domain/analysis";
import type { CountryCode } from "@/domain/country";
import { TEST_NOW } from "@/test/fixtures";
import { buildFactSheet } from "./fact-sheet";
import { clearInsightCache, GenerationRateLimitedError, getAnalysisInsight, PROMPT_VERSION, type InsightDeps } from "./insight";
import { mockStoredAnalysis } from "./test-analysis";
import { AiAnswerIncompleteError, type AiJsonRequest, type EngineLoadResult, type LocalAiEngine } from "./types";

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
    expect(result.missingCountries).toEqual([]);
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
    expect(result).toEqual({ status: "rejected", reason: "L'IA a cité un nombre absent des données de l'analyse (4 321,77)." });
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

  it("says which analysed countries got no line when the model repeated one and skipped another", async () => {
    const { deps } = fakeEngine(() => ({
      ...goodAnswer(),
      countries: [
        { country: "FR", sentence: "À tester prudemment." },
        { country: "FR", sentence: "Encore la France." },
      ],
    }));

    const result = await getAnalysisInsight(analysis, deps);

    if (result.status !== "ready") throw new Error(`expected ready, got ${result.status}`);
    expect(result.insight.countries.map((c) => c.country)).toEqual(["FR"]);
    expect(result.missingCountries).toEqual(["DE"]);
  });

  it.each([
    ["full-width digits", "Environ １５０ commandes par mois.", "150"],
    ["Arabic-Indic digits", "Environ ١٥٠ commandes par mois.", "١٥٠"],
    ["an en dash as a minus", "Tendance –999 % par an.", "–999"],
  ])("rejects a number written with %s", async (_label, summary, cited) => {
    const { deps } = fakeEngine(() => ({ ...goodAnswer(), summary }));

    expect(await getAnalysisInsight(analysis, deps)).toEqual({ status: "rejected", reason: `L'IA a cité un nombre absent des données de l'analyse (${cited}).` });
  });

  it("rejects numbers that only appear in the sheet's labels, scales or headings", async () => {
    // "(P10, P50, P90)", "sur 100" and "12 derniers mois" are in the sheet, but as labels.
    for (const summary of ["Le marché devrait progresser de 90 % cette année.", "Une marge de 100 % est possible.", "Environ 12 % de croissance."]) {
      clearInsightCache();
      const { deps } = fakeEngine(() => ({ ...goodAnswer(), summary }));
      expect(await getAnalysisInsight(analysis, deps)).toMatchObject({ status: "rejected" });
    }
  });

  it("accepts labels repeated around real values (scale, percentiles, windows)", async () => {
    const summary = `La confiance pour la France est de ${frConfidence} sur 100 ; les P10, P50 et P90 encadrent l'estimation sur les 12 prochains mois.`;
    const { deps } = fakeEngine(() => ({ ...goodAnswer(), summary }));

    expect(await getAnalysisInsight(analysis, deps)).toMatchObject({ status: "ready" });
  });

  it("reports an answer cut off at the token limit as rejected, not as an engine failure", async () => {
    const { deps } = fakeEngine(() => {
      throw new AiAnswerIncompleteError();
    });

    expect(await getAnalysisInsight(analysis, deps)).toEqual({ status: "rejected", reason: "La réponse de l'IA est incomplète (coupée avant la fin)." });
  });

  it("asks for the generation budget only once the model is about to run", async () => {
    const admitGeneration = vi.fn(() => ({ allowed: false as const, retryAfterSeconds: 42 }));
    const off = vi.fn(async (): Promise<EngineLoadResult> => ({ ok: false, reason: "IA locale désactivée (LOCAL_AI_ENABLED=false)." }));

    expect(await getAnalysisInsight(analysis, { loadEngine: off, now: () => TEST_NOW, admitGeneration })).toMatchObject({ status: "unavailable" });
    expect(admitGeneration).not.toHaveBeenCalled();

    const { deps, completeJson } = fakeEngine(goodAnswer);
    await expect(getAnalysisInsight(analysis, { ...deps, admitGeneration })).rejects.toBeInstanceOf(GenerationRateLimitedError);
    expect(admitGeneration).toHaveBeenCalledTimes(1);
    expect(completeJson).not.toHaveBeenCalled();
  });

  it("says a failed analysis failed, without loading the model", async () => {
    const { deps, loadEngine } = fakeEngine(goodAnswer);

    expect(await getAnalysisInsight({ ...analysis, status: "failed" }, deps)).toEqual({ status: "unavailable", reason: "L'analyse a échoué : il n'y a rien à relire." });
    expect(loadEngine).not.toHaveBeenCalled();
  });

  it("rejects an answer that does not match the schema", async () => {
    const { deps } = fakeEngine(() => ({ summary: "", countries: "FR" }));

    expect(await getAnalysisInsight(analysis, deps)).toEqual({ status: "rejected", reason: "La réponse de l'IA n'a pas le format attendu." });
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
