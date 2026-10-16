import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createAnalysis } = vi.hoisted(() => ({
  createAnalysis: vi.fn<(input: unknown) => Promise<{ id: string; status: string }>>(async () => ({ id: "a", status: "completed" })),
}));

// No database and no provider: the route only needs the service boundary.
vi.mock("@/server/services", () => ({ createAnalysis, listRecentAnalyses: vi.fn(async () => []) }));

import { ANALYSIS_RATE_LIMIT } from "@/server/rate-limit";
import { POST } from "./route";

const HOST = "localhost:3100";
const URL_ = `http://${HOST}/api/analyses`;
const VALID_BODY = JSON.stringify({ productName: "desk lamp" });

// The rate limiter keeps module-level fixed windows keyed by string. Each test starts in a new
// window by moving the (fake) clock forward by more than the window length.
const STEP_MS = ANALYSIS_RATE_LIMIT.windowMs + 1_000;
let clock = Date.UTC(2026, 0, 1);

function post(body: string, headers: Record<string, string>): Promise<Response> {
  return POST(new Request(URL_, { method: "POST", headers, body }));
}

const sameOriginJson = { "content-type": "application/json", origin: `http://${HOST}`, host: HOST };

beforeEach(() => {
  // Only Date is faked: the request body is read through streams that must keep real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  clock += STEP_MS;
  vi.setSystemTime(clock);
  createAnalysis.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/analyses", () => {
  it("refuses a text/plain body without starting an analysis", async () => {
    const response = await post(VALID_BODY, { "content-type": "text/plain", origin: "https://evil.example", host: HOST });

    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "unsupported_media_type", message: "Content-Type application/json requis." },
    });
    expect(createAnalysis).not.toHaveBeenCalled();
  });

  it("refuses a cross-origin request without starting an analysis", async () => {
    const response = await post(VALID_BODY, { "content-type": "application/json", origin: "https://evil.example", host: HOST });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "forbidden_origin", message: "Origine non autorisée." },
    });
    expect(createAnalysis).not.toHaveBeenCalled();
  });

  it("ignores a forged X-Forwarded-Host when checking the origin", async () => {
    const response = await post(VALID_BODY, { ...sameOriginJson, origin: "https://evil.example", "x-forwarded-host": "evil.example" });

    expect(response.status).toBe(403);
    expect(createAnalysis).not.toHaveBeenCalled();
  });

  it("starts an analysis for a same-origin JSON request", async () => {
    const response = await post(VALID_BODY, sameOriginJson);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true, data: { id: "a", status: "completed" }, error: null });
    expect(createAnalysis).toHaveBeenCalledTimes(1);
    expect(createAnalysis).toHaveBeenCalledWith({ productName: "desk lamp" });
  });

  it("starts an analysis for a JSON request without Origin (not authentication)", async () => {
    const response = await post(VALID_BODY, { "content-type": "application/json" });

    expect(response.status).toBe(201);
    expect(createAnalysis).toHaveBeenCalledTimes(1);
  });

  it("answers 400 for a malformed JSON body from an allowed request", async () => {
    const response = await post("{not json", sameOriginJson);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_json" } });
    expect(createAnalysis).not.toHaveBeenCalled();
  });

  it("does not let X-Forwarded-For bypass the rate limit", async () => {
    const statuses: number[] = [];
    for (let i = 0; i <= ANALYSIS_RATE_LIMIT.limit; i += 1) {
      const response = await post(VALID_BODY, { ...sameOriginJson, "x-forwarded-for": `203.0.113.${i + 1}` });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, ANALYSIS_RATE_LIMIT.limit)).toEqual(Array(ANALYSIS_RATE_LIMIT.limit).fill(201));
    expect(statuses[ANALYSIS_RATE_LIMIT.limit]).toBe(429);
    expect(createAnalysis).toHaveBeenCalledTimes(ANALYSIS_RATE_LIMIT.limit);
  });

  it("answers 429 with Retry-After once the API-wide bucket is spent", async () => {
    for (let i = 0; i < ANALYSIS_RATE_LIMIT.limit; i += 1) await post(VALID_BODY, sameOriginJson);

    const response = await post(VALID_BODY, sameOriginJson);

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await response.json()).toMatchObject({ error: { code: "rate_limited" } });
  });

  it("checks the request before it spends the rate limit", async () => {
    for (let i = 0; i < ANALYSIS_RATE_LIMIT.limit + 5; i += 1) {
      expect((await post(VALID_BODY, { "content-type": "text/plain" })).status).toBe(415);
      expect((await post(VALID_BODY, { ...sameOriginJson, origin: "https://evil.example" })).status).toBe(403);
    }

    // Refused requests did not use the bucket: a legitimate caller is still served.
    expect((await post(VALID_BODY, sameOriginJson)).status).toBe(201);
  });

  it("applies the rate limit before reading the body", async () => {
    for (let i = 0; i < ANALYSIS_RATE_LIMIT.limit; i += 1) await post(VALID_BODY, sameOriginJson);

    const response = await post("{not json", sameOriginJson);

    expect(response.status).toBe(429);
  });
});
