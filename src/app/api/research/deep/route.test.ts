import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueDeepResearch = vi.fn();
vi.mock("@/server/jobs", () => ({ enqueueDeepResearch }));

const route = await import("./route");

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/research/deep", { method: "POST", headers: { host: "localhost:3000", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  enqueueDeepResearch.mockResolvedValue("11111111-2222-4333-8444-555555555555");
});

describe("POST /api/research/deep", () => {
  it("queues the research and answers at once with its id", async () => {
    const response = await route.POST(post({ product: "gourde inox", country: "FR" }, { cookie: "ez-locale=fr" }));
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ success: true, data: { id: "11111111-2222-4333-8444-555555555555" } });
    expect(enqueueDeepResearch).toHaveBeenCalledWith(expect.objectContaining({ product: "gourde inox", country: "FR" }), "fr");
  });

  it("refuses a bad body or another site, and queues nothing", async () => {
    expect((await route.POST(post({ product: "x" }))).status).toBe(400);
    expect((await route.POST(post({ product: "gourde", country: "FR" }, { origin: "https://evil.example" }))).status).toBe(403);
    expect(enqueueDeepResearch).not.toHaveBeenCalled();
  });

  it("says so when the research could not be recorded", async () => {
    enqueueDeepResearch.mockResolvedValueOnce(null);
    expect((await route.POST(post({ product: "gourde inox", country: "FR" }))).status).toBe(503);
  });
});
