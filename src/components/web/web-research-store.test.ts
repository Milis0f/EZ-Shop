import { beforeEach, describe, expect, it, vi } from "vitest";
import { declineWebResearch, getWebResearchView, resetWebResearchStore, runWebResearch } from "./web-research-store";

const READY = { status: "ready", query: "q", sources: [], reading: { summary: null, note: "ai_missing" }, durationMs: 5 };
const answering = (data: unknown) => vi.fn(async () => Response.json({ success: true, data, error: null })) as unknown as typeof fetch;

beforeEach(resetWebResearchStore);

describe("web research state", () => {
  it("asks first and sends nothing by itself", () => {
    expect(getWebResearchView("cap")).toEqual({ kind: "ask" });
  });

  it("remembers a refusal, per query", () => {
    declineWebResearch("cap");
    expect(getWebResearchView("cap")).toEqual({ kind: "declined" });
    expect(getWebResearchView("mug")).toEqual({ kind: "ask" });
  });

  it("shows the answer after a yes", async () => {
    const request = answering(READY);
    const run = runWebResearch("cap", request);
    expect(getWebResearchView("cap")).toEqual({ kind: "searching" });
    await run;
    expect(getWebResearchView("cap")).toEqual({ kind: "done", response: READY });
    expect(request).toHaveBeenCalledWith("/api/web/research", expect.objectContaining({ method: "POST", body: JSON.stringify({ query: "cap" }) }));
  });

  it("runs one search at a time per query", async () => {
    const request = answering(READY);
    await Promise.all([runWebResearch("cap", request), runWebResearch("cap", request)]);
    expect(request).toHaveBeenCalledOnce();
  });

  it("reports a failed request and a malformed answer", async () => {
    await runWebResearch("a", vi.fn(async () => Promise.reject(new Error("down"))) as unknown as typeof fetch);
    expect(getWebResearchView("a")).toEqual({ kind: "error" });
    await runWebResearch("b", answering({ status: "nonsense" }));
    expect(getWebResearchView("b")).toEqual({ kind: "error" });
  });
});
