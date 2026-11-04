import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/test/pglite";
import { DrizzleCompetitorReadingRepository } from "./competitor-readings";

/** The migrated schema, in memory: what competitor_readings really stores and gives back. */
describe("DrizzleCompetitorReadingRepository", { timeout: 30_000 }, () => {
  let test: TestDatabase;
  let repo: DrizzleCompetitorReadingRepository;

  beforeAll(async () => {
    test = await createTestDatabase();
    repo = new DrizzleCompetitorReadingRepository(test.db);
  });
  afterAll(() => test.close());

  const products = [{ handle: "a", title: "A", variants: [["1", 1, 19.9] as const] }];

  it("keeps dated readings per shop, most recent first, with their completeness", async () => {
    await repo.add({ domain: "s.example", observedAt: "2026-11-01T00:00:00.000Z", snapshot: { at: "", products }, complete: true, extra: { technologies: ["Shopify"] } });
    await repo.add({ domain: "s.example", observedAt: "2026-11-02T00:00:00.000Z", snapshot: { at: "", products: [] }, complete: false, extra: {} });
    await repo.add({ domain: "other.example", observedAt: "2026-11-03T00:00:00.000Z", snapshot: { at: "", products }, complete: true, extra: {} });

    const list = await repo.list("s.example", 10);
    expect(list.map((r) => [r.observedAt, r.complete])).toEqual([
      ["2026-11-02T00:00:00.000Z", false],
      ["2026-11-01T00:00:00.000Z", true],
    ]);
    expect(list[1].snapshot).toEqual({ at: "2026-11-01T00:00:00.000Z", products });
    expect(list[1].extra).toMatchObject({ technologies: ["Shopify"] });
    expect((await repo.latest("s.example"))?.observedAt).toBe("2026-11-02T00:00:00.000Z");
    expect(await repo.latest("none.example")).toBeNull();
  });

  it("lists the shops watched, most recently checked first", async () => {
    expect(await repo.shops(10)).toEqual([
      { domain: "other.example", readings: 1, firstAt: "2026-11-03T00:00:00.000Z", lastAt: "2026-11-03T00:00:00.000Z" },
      { domain: "s.example", readings: 2, firstAt: "2026-11-01T00:00:00.000Z", lastAt: "2026-11-02T00:00:00.000Z" },
    ]);
  });
});
