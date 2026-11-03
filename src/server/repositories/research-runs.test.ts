import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/test/pglite";
import { historyQueryOf } from "@/components/history/history-list";
import { DrizzleResearchRunRepository } from "./research-runs";

/** The migrated schema, in memory: what research_runs really stores and gives back. */
describe("DrizzleResearchRunRepository", { timeout: 30_000 }, () => {
  let test: TestDatabase;
  let runs: DrizzleResearchRunRepository;

  beforeAll(async () => {
    test = await createTestDatabase();
    runs = new DrizzleResearchRunRepository(test.db);
  });
  afterAll(() => test.close());
  beforeEach(async () => {
    await test.db.execute(sql`TRUNCATE research_runs`);
  });

  const run = (title: string, kind: "deep_research" | "competitor" | "web_research" = "deep_research") => ({ kind, title, locale: "fr", countries: ["FR"], params: { product: title } });

  it("keeps a run from its start to its report", async () => {
    const id = await runs.start(run("gourde inox"));
    expect(await runs.findById(id)).toMatchObject({ status: "running", title: "gourde inox", countries: ["FR"], result: null, finishedAt: null });

    await runs.finish(id, { status: "completed", result: { sources: [{ url: "https://a.example" }] }, sourceCount: 1, model: "Qwen3.5-9B", durationMs: 61_000 });
    expect(await runs.findById(id)).toMatchObject({
      status: "completed",
      result: { sources: [{ url: "https://a.example" }] },
      sourceCount: 1,
      model: "Qwen3.5-9B",
      durationMs: 61_000,
      progress: 1,
    });
  });

  it("filters by kind, searches the title, sorts both ways", async () => {
    await runs.start(run("gourde inox"));
    await runs.start(run("authentiksneakers.com", "competitor"));
    await runs.start(run("tapis de yoga", "web_research"));

    expect((await runs.list({ kind: "competitor", order: "newest", limit: 10 })).map((r) => r.title)).toEqual(["authentiksneakers.com"]);
    expect((await runs.list({ q: "GOURDE", order: "newest", limit: 10 })).map((r) => r.title)).toEqual(["gourde inox"]);
    expect((await runs.list({ order: "oldest", limit: 10 })).map((r) => r.title)).toEqual(["gourde inox", "authentiksneakers.com", "tapis de yoga"]);
    expect((await runs.list({ order: "newest", limit: 10 })).map((r) => r.title)[0]).toBe("tapis de yoga");
  });

  it("reads % and _ in a search as letters", async () => {
    await runs.start(run("remise 50% été"));
    await runs.start(run("remise 50 euros"));
    expect((await runs.list({ q: "50%", order: "newest", limit: 10 })).map((r) => r.title)).toEqual(["remise 50% été"]);
  });

  it("removes one run only", async () => {
    const kept = await runs.start(run("a"));
    const gone = await runs.start(run("b"));
    expect(await runs.delete(gone)).toBe(true);
    expect(await runs.delete(gone)).toBe(false);
    expect(await runs.findById(kept)).not.toBeNull();
  });

  it("marks the runs cut by a stop as interrupted, not the finished ones", async () => {
    const cut = await runs.start(run("cut"));
    const done = await runs.start(run("done"));
    await runs.finish(done, { status: "completed" });
    expect(await runs.markInterrupted(new Date(Date.now() + 1000))).toBe(1);
    expect((await runs.findById(cut))?.status).toBe("interrupted");
    expect((await runs.findById(done))?.status).toBe("completed");
  });

  it("skips a row whose kind this version does not know", async () => {
    await test.db.execute(sql`INSERT INTO research_runs (kind, title, status, locale, params) VALUES ('future_kind', 'x', 'completed', 'fr', '{}')`);
    expect(await runs.list({ order: "newest", limit: 10 })).toEqual([]);
  });
});

describe("historyQueryOf", () => {
  it("reads the page address, and falls back on anything unknown", () => {
    expect(historyQueryOf({ kind: "competitor", q: " sneakers ", order: "oldest" })).toEqual({ kind: "competitor", q: "sneakers", order: "oldest" });
    expect(historyQueryOf({ kind: "nope", order: "sideways" })).toEqual({ kind: undefined, q: undefined, order: "newest" });
    expect(historyQueryOf({ q: "x".repeat(500) }).q).toBeUndefined();
  });
});
