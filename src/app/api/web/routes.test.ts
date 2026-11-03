import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebResearch = vi.fn();
const analyzeCompetitor = vi.fn();
const startInstall = vi.fn();
const cancelInstall = vi.fn();
const installStatus = vi.fn();
const recordRun = vi.fn(async () => null);
vi.mock("@/server/web/research", () => ({ runWebResearch }));
vi.mock("@/server/web/competitor", () => ({ analyzeCompetitor }));
vi.mock("@/server/history", () => ({ recordRun }));
vi.mock("@/server/ai/installer", () => ({ startInstall, cancelInstall, installStatus }));

const research = await import("./research/route");
const competitor = await import("./competitor/route");
const install = await import("../ai/install/route");

const post = (url: string, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }, method = "POST") =>
  new Request(`http://localhost:3000${url}`, { method, headers: { host: "localhost:3000", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

const READY = { status: "unavailable", code: "no_results" };

beforeEach(() => {
  vi.clearAllMocks();
  runWebResearch.mockResolvedValue(READY);
  analyzeCompetitor.mockResolvedValue({ status: "blocked", code: "robots" });
  startInstall.mockResolvedValue({ state: "downloading" });
  cancelInstall.mockResolvedValue({ state: "missing" });
  installStatus.mockResolvedValue({ state: "missing" });
});

describe("POST /api/web/research", () => {
  it("runs the search in the visitor's language", async () => {
    const response = await research.POST(post("/api/web/research", { query: "  tuyau PVC " }, { "content-type": "application/json", cookie: "ez-locale=fr" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: READY });
    expect(runWebResearch).toHaveBeenCalledWith("tuyau PVC", "fr");
  });

  it.each([[{ query: "x" }], [{ query: "y".repeat(201) }], [{}], ["not json"]])("refuses %j", async (body) => {
    const response = await research.POST(post("/api/web/research", body));
    expect(response.status).toBe(400);
    expect(runWebResearch).not.toHaveBeenCalled();
  });

  it("refuses another site and a non-JSON request", async () => {
    expect((await research.POST(post("/api/web/research", { query: "ok ok" }, { "content-type": "application/json", origin: "https://evil.example" }))).status).toBe(403);
    expect((await research.POST(post("/api/web/research", { query: "ok ok" }, { "content-type": "text/plain" }))).status).toBe(415);
    expect(runWebResearch).not.toHaveBeenCalled();
  });

  it("hides internal errors", async () => {
    runWebResearch.mockRejectedValueOnce(new Error("secret path C:\\x"));
    const response = await research.POST(post("/api/web/research", { query: "ok ok" }));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret path");
  });
});

describe("POST /api/web/competitor", () => {
  it("passes the address and the choices: no supplier search, a deep check, by default", async () => {
    await competitor.POST(post("/api/web/competitor", { url: "https://shop.example/p" }));
    expect(analyzeCompetitor).toHaveBeenCalledWith("https://shop.example/p", { searchSupplier: false, deep: true }, "en");
    await competitor.POST(post("/api/web/competitor", { url: "https://shop.example/p", searchSupplier: true, deep: false }));
    expect(analyzeCompetitor).toHaveBeenLastCalledWith("https://shop.example/p", { searchSupplier: true, deep: false }, "en");
  });

  it("refuses a bad body", async () => {
    expect((await competitor.POST(post("/api/web/competitor", { url: 12 }))).status).toBe(400);
    expect((await competitor.POST(post("/api/web/competitor", { url: "a".repeat(2001) }))).status).toBe(400);
    expect(recordRun).not.toHaveBeenCalled();
  });

  it("keeps each check in the history, a refused one with its reason", async () => {
    await competitor.POST(post("/api/web/competitor", { url: "https://shop.example/p" }));
    expect(recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "competitor", title: "https://shop.example/p", params: expect.objectContaining({ url: "https://shop.example/p" }) }),
      { status: "failed", error: "robots" },
    );
  });
});

describe("history of web searches", () => {
  it("keeps a search, with why it found nothing", async () => {
    await research.POST(post("/api/web/research", { query: "tuyau PVC" }));
    expect(recordRun).toHaveBeenCalledWith(expect.objectContaining({ kind: "web_research", title: "tuyau PVC" }), { status: "failed", error: "no_results" });
  });
});

describe("/api/ai/install", () => {
  it("reads the state without any guard", async () => {
    const response = await install.GET(new Request("http://localhost:3000/api/ai/install"));
    expect(await response.json()).toMatchObject({ success: true, data: { state: "missing" } });
  });

  it("starts and stops only for same-origin JSON requests", async () => {
    expect((await install.POST(post("/api/ai/install", {}))).status).toBe(200);
    expect(startInstall).toHaveBeenCalledOnce();
    expect((await install.DELETE(post("/api/ai/install", {}, undefined, "DELETE"))).status).toBe(200);
    expect(cancelInstall).toHaveBeenCalledOnce();
    expect((await install.POST(post("/api/ai/install", {}, { "content-type": "application/json", origin: "https://evil.example" }))).status).toBe(403);
    expect((await install.POST(post("/api/ai/install", {}, { "content-type": "text/plain" }))).status).toBe(415);
    expect(startInstall).toHaveBeenCalledOnce();
  });
});
