import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResult } from "@/domain/analysis";

const { getAnalysis, getLocalAiEngine } = vi.hoisted(() => ({
  getAnalysis: vi.fn<(id: string) => Promise<AnalysisResult | null>>(async () => null),
  getLocalAiEngine: vi.fn(),
}));

// The route only needs the service boundary; the engine is a fake: no database, no model.
vi.mock("@/server/services", () => ({ getAnalysis }));
vi.mock("@/server/ai/engine", () => ({ getLocalAiEngine }));

import { AI_INSIGHT_METHOD } from "@/domain/ai-insight";
import { AI_INSIGHT_RATE_LIMIT, AI_REQUEST_RATE_LIMIT, clearInsightCache } from "@/server/ai/insight";
import { mockStoredAnalysis } from "@/test/stored-analysis";
import type { LocalAiEngine } from "@/server/ai/types";
import { POST } from "./route";

const HOST = "localhost:3100";
const ID = "0f8e6a52-3c1d-4f5e-9a7b-2d4c6e8f0a1b";
const sameOriginJson = { "content-type": "application/json", origin: `http://${HOST}`, host: HOST };

const STEP_MS = Math.max(AI_INSIGHT_RATE_LIMIT.windowMs, AI_REQUEST_RATE_LIMIT.windowMs) + 1_000;
let clock = Date.UTC(2026, 0, 1);

function post(headers: Record<string, string>, id = ID): Promise<Response> {
  const request = new Request(`http://${HOST}/api/analyses/${id}/ai`, { method: "POST", headers, body: "{}" });
  return POST(request, { params: Promise.resolve({ id }) });
}

const engine: LocalAiEngine = {
  model: { name: "Fake model", license: "Apache-2.0" },
  completeJson: vi.fn(async () => ({
    summary: "Les données de cette analyse sont fictives.",
    countries: [{ country: "FR", sentence: "France : données fictives, rien à conclure." }],
    nextSteps: ["Brancher une source réelle."],
    productReading: { category: "Textile chauffant", description: "Probablement des chaussettes qui chauffent." },
  })),
};

let analysis: AnalysisResult;

beforeAll(async () => {
  analysis = await mockStoredAnalysis(["FR"]);
});

beforeEach(() => {
  // Only Date is faked: each test starts in a new rate-limit window.
  vi.useFakeTimers({ toFake: ["Date"] });
  clock += STEP_MS;
  vi.setSystemTime(clock);
  clearInsightCache();
  getAnalysis.mockReset();
  getAnalysis.mockResolvedValue(null);
  getLocalAiEngine.mockReset();
  getLocalAiEngine.mockResolvedValue({ ok: true, engine });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/analyses/:id/ai", () => {
  it("refuses a text/plain request before reading the analysis", async () => {
    const response = await post({ "content-type": "text/plain", host: HOST });

    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "unsupported_media_type" } });
    expect(getAnalysis).not.toHaveBeenCalled();
  });

  it("refuses a cross-origin request before reading the analysis", async () => {
    const response = await post({ ...sameOriginJson, origin: "https://evil.example" });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "forbidden_origin" } });
    expect(getAnalysis).not.toHaveBeenCalled();
  });

  it("answers 404 for an analysis that does not exist, without loading the model", async () => {
    const response = await post(sameOriginJson);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "not_found", message: "Analysis not found." } });
    expect(getLocalAiEngine).not.toHaveBeenCalled();
  });

  it("returns the AI reading of an existing analysis", async () => {
    getAnalysis.mockResolvedValue(analysis);

    const response = await post(sameOriginJson);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getAnalysis).toHaveBeenCalledWith(ID);
    expect(body).toMatchObject({ success: true, error: null, data: { status: "ready", method: AI_INSIGHT_METHOD, cached: false } });
    expect(body.data.insight.countries).toEqual([{ country: "FR", sentence: "France : données fictives, rien à conclure." }]);
  });

  it("returns 200 with status unavailable when the engine cannot run", async () => {
    getAnalysis.mockResolvedValue(analysis);
    getLocalAiEngine.mockResolvedValue({ ok: false, reason: "IA locale désactivée (LOCAL_AI_ENABLED=false)." });

    const response = await post(sameOriginJson);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { status: "unavailable", reason: "IA locale désactivée (LOCAL_AI_ENABLED=false)." } });
  });

  it("answers 429 with Retry-After once the endpoint bucket is spent", async () => {
    for (let i = 0; i < AI_REQUEST_RATE_LIMIT.limit; i += 1) expect((await post(sameOriginJson)).status).toBe(404);

    const response = await post(sameOriginJson);

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await response.json()).toMatchObject({ error: { code: "rate_limited" } });
  });

  it("never counts a cached reading against the generation bucket", async () => {
    getAnalysis.mockResolvedValue(analysis);
    vi.mocked(engine.completeJson).mockClear();

    for (let i = 0; i <= AI_INSIGHT_RATE_LIMIT.limit + 5; i += 1) {
      const response = await post(sameOriginJson);
      expect(response.status).toBe(200);
      expect((await response.json()).data).toMatchObject({ status: "ready", cached: i > 0 });
    }
    expect(engine.completeJson).toHaveBeenCalledTimes(1);
  });

  it("answers 429 once too many new readings were started, and still serves cached ones", async () => {
    const ids = Array.from({ length: AI_INSIGHT_RATE_LIMIT.limit + 1 }, (_, i) => `0f8e6a52-3c1d-4f5e-9a7b-${String(i).padStart(12, "0")}`);
    getAnalysis.mockImplementation(async (id) => ({ ...analysis, id }));

    for (const id of ids.slice(0, -1)) expect((await post(sameOriginJson, id)).status).toBe(200);
    const refused = await post(sameOriginJson, ids.at(-1));

    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await refused.json()).toMatchObject({ error: { code: "rate_limited" } });
    const again = await post(sameOriginJson, ids[0]);
    expect(again.status).toBe(200);
    expect((await again.json()).data).toMatchObject({ status: "ready", cached: true });
  });

  it("never spends the generation bucket when the AI is off (nothing reaches the model)", async () => {
    getAnalysis.mockImplementation(async (id) => ({ ...analysis, id }));
    getLocalAiEngine.mockResolvedValue({ ok: false, reason: "IA locale désactivée (LOCAL_AI_ENABLED=false)." });

    for (let i = 0; i <= AI_INSIGHT_RATE_LIMIT.limit + 5; i += 1) {
      const response = await post(sameOriginJson, `0f8e6a52-3c1d-4f5e-9a7b-${String(i).padStart(12, "0")}`);
      expect(response.status).toBe(200);
      expect((await response.json()).data).toMatchObject({ status: "unavailable" });
    }
  });

  it("answers 500 without details when reading the analysis fails", async () => {
    getAnalysis.mockRejectedValue(new Error("database down: postgres://user:pw@host/db"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await post(sameOriginJson);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain("postgres://");
    error.mockRestore();
  });
});
