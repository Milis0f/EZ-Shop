import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { count, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/config/env";
import type { AnalysisResult } from "@/domain/analysis";
import type { CountryCode } from "@/domain/country";
import { isKnown } from "@/domain/datum";
import { parseJsonForStorage } from "@/lib/storage-safe";
import { ok } from "@/providers/contracts";
import { cached } from "@/providers/http";
import { createProviderSet, REAL_PROVIDER_METAS, type ProviderSet } from "@/providers/registry";
import { createTestDatabase, truncateAll, type TestDatabase } from "@/test/pglite";
import { TEST_NOW as NOW } from "@/test/fixtures";
import type { Database } from "../db/client";
import * as t from "../db/schema";
import { runAnalysis } from "../pipeline/run-analysis";
import { DrizzleAnalysisRepository } from "./drizzle-analysis-repository";
import { DrizzleCacheRepository } from "./drizzle-cache-repository";
import { createMemoryRepositories, MemoryAnalysisRepository } from "./memory-repositories";
import type { CompletedAnalysis, NewAnalysis, ObservationRecord, ProviderCacheRepository } from "./types";

/**
 * Characterisation tests: real migrations on in-memory PGlite, no mock of the database layer.
 * They pin what the repositories persist today; a failure is a behaviour change to report.
 */

const devEnv = { NODE_ENV: "development", PGLITE_DATA_DIR: ".data/test", PROVIDER_HTTP_TIMEOUT_MS: 1000 } as ServerEnv;

// Same input as src/server/pipeline/run-analysis.test.ts. The input refuses mock data, so the offline
// fixtures come in through the providers seam.
const input = {
  productName: "Chaussettes chauffantes",
  countries: ["FR", "DE", "US"],
  extraTerms: [
    { language: "de", term: "beheizbare Socken" },
    { language: "en", term: "heated socks" },
  ],
  economics: { currency: "EUR", sellingPrice: 29, landedCost: 9 },
};

// An observation whose only defect, once its country is lowercased, is the ISO2 CHECK.
const validObservation: ObservationRecord = {
  providerId: "world-bank",
  country: "FR",
  metric: "gdp_per_capita",
  value: 1,
  unit: "usd",
  origin: "mock",
  connectorVersion: "test",
  collectedAt: NOW.toISOString(),
};

let database: TestDatabase;
let db: Database;
let analyses: DrizzleAnalysisRepository;
let cache: DrizzleCacheRepository;

beforeAll(async () => {
  database = await createTestDatabase();
  db = database.db;
  analyses = new DrizzleAnalysisRepository(db);
  cache = new DrizzleCacheRepository(db);
}, 30_000);

afterAll(async () => {
  await database.close();
});

// Mock mode must never reach the network: any call would fail the test.
const networkGuard = vi.fn(() => Promise.reject(new Error("network disabled in tests")));

beforeEach(async () => {
  await truncateAll(db);
  networkGuard.mockClear();
  vi.stubGlobal("fetch", networkGuard);
});

afterEach(() => {
  vi.unstubAllGlobals();
  expect(networkGuard).not.toHaveBeenCalled();
});

const mockProviders = (providerCache: ProviderCacheRepository, now: Date): ProviderSet =>
  createProviderSet("mock", { env: devEnv, cache: providerCache, now: () => now });

function analyse(now: Date = NOW): Promise<AnalysisResult> {
  return runAnalysis(input, { repositories: { analyses, cache }, env: devEnv, now: () => now, providers: mockProviders(cache, now) });
}

/** A valid CompletedAnalysis (and the NewAnalysis that produced it), built without touching the database under test. */
async function buildValidPayload(): Promise<{ newAnalysis: NewAnalysis; completed: CompletedAnalysis }> {
  const memory = createMemoryRepositories();
  const result = await runAnalysis(input, { repositories: memory, env: devEnv, now: () => NOW, providers: mockProviders(memory.cache, NOW) });
  const completed = (memory.analyses as MemoryAnalysisRepository).persisted(result.id)!;
  const newAnalysis: NewAnalysis = {
    product: result.product,
    input: result.input,
    economics: result.economics,
    dataMode: result.dataMode,
    modelVersion: result.modelVersion,
    providers: result.providers,
    providerMetas: REAL_PROVIDER_METAS,
  };
  return { newAnalysis, completed };
}

async function countBy(table: PgTable, column: PgColumn, value: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(table).where(eq(column, value));
  return row.n;
}

async function countAll(table: PgTable): Promise<number> {
  const [row] = await db.select({ n: count() }).from(table);
  return row.n;
}

describe("Drizzle repositories on in-memory PGlite", () => {
  it("applies every migration, including the analyses.context column", async () => {
    const columns = await db
      .select({ dataType: sql<string>`data_type` })
      .from(sql`information_schema.columns`)
      .where(sql`table_name = 'analyses' AND column_name = 'context'`);
    expect(columns).toEqual([{ dataType: "jsonb" }]);
  });

  it("persists a mock analysis and reads it back unchanged", async () => {
    const result = await analyse();

    expect(await analyses.findById(result.id)).toEqual(result);
  });

  it("writes the audit rows of a completed analysis", async () => {
    const result = await analyse();
    const id = result.id;

    expect(await countBy(t.countryResults, t.countryResults.analysisId, id)).toBe(3);
    expect(await countBy(t.scoreComponents, t.scoreComponents.analysisId, id)).toBeGreaterThan(0);
    expect(await countBy(t.forecasts, t.forecasts.analysisId, id)).toBeGreaterThan(0);
    expect(await countBy(t.assumptions, t.assumptions.analysisId, id)).toBe(result.assumptions.length);

    expect(await countBy(t.observations, t.observations.analysisId, id)).toBeGreaterThan(100);
    const origins = await db.selectDistinct({ origin: t.observations.origin }).from(t.observations).where(eq(t.observations.analysisId, id));
    expect(origins).toEqual([{ origin: "mock" }]);

    // Ad libraries cover the EU only: the US has no competition snapshot.
    const snapshotCountries = await db
      .selectDistinct({ country: t.competitionSnapshots.countryCode })
      .from(t.competitionSnapshots)
      .where(eq(t.competitionSnapshots.analysisId, id));
    expect(snapshotCountries.length).toBeGreaterThan(0);
    expect(snapshotCountries.map((r) => r.country)).not.toContain("US");

    const [row] = await db.select({ status: t.analyses.status }).from(t.analyses).where(eq(t.analyses.id, id));
    expect(row.status).toBe("completed");
  });

  it("rolls back every audit row when one is rejected", async () => {
    const { newAnalysis, completed } = await buildValidPayload();
    const created = await analyses.create(newAnalysis);
    const id = created.id;

    // Every earlier insert of complete() succeeds; only the lowercase country breaks the ISO2 CHECK.
    const rejected = analyses.complete({
      ...completed,
      result: { ...completed.result, id },
      productId: created.productId,
      observations: [{ ...validObservation, country: "fr" as CountryCode }],
    });
    // 23514 = check_violation: the failure is the ISO2 constraint, not an unrelated error.
    await expect(rejected).rejects.toMatchObject({ cause: { code: "23514" } });

    expect(await countBy(t.countryResults, t.countryResults.analysisId, id)).toBe(0);
    expect(await countBy(t.scoreComponents, t.scoreComponents.analysisId, id)).toBe(0);
    expect(await countBy(t.forecasts, t.forecasts.analysisId, id)).toBe(0);
    expect(await countBy(t.assumptions, t.assumptions.analysisId, id)).toBe(0);
    expect(await countBy(t.observations, t.observations.analysisId, id)).toBe(0);
    const [row] = await db.select({ status: t.analyses.status }).from(t.analyses).where(eq(t.analyses.id, id));
    expect(row.status).toBe("running");
  });

  it("lists recent analyses newest first with their best scored country", async () => {
    const first = await analyse();
    const second = await analyse(new Date(NOW.getTime() + 60_000));

    const [newest] = await analyses.listRecent(1);
    expect(newest.id).toBe(second.id);
    expect((await analyses.listRecent(5)).map((s) => s.id)).toEqual([second.id, first.id]);

    // Best score wins. The confidence tie-break in this expected value mirrors `toSummary` but no test
    // checks it on its own. The newest-first order relies on the database clock (`created_at` defaults to now()).
    const best = second.countries
      .filter((c) => isKnown(c.scoring.score))
      .toSorted((a, b) => {
        const score = (c: typeof a) => (isKnown(c.scoring.score) ? c.scoring.score.value.total : 0);
        return score(b) - score(a) || b.scoring.confidence.score - a.scoring.confidence.score;
      })[0];
    expect(best).toBeDefined();
    expect(newest.topCountry).toEqual({
      code: best.country,
      score: isKnown(best.scoring.score) ? best.scoring.score.value.total : undefined,
      confidence: best.scoring.confidence.score,
    });
  });

  it("records a failure with the message cut at 2 000 characters", async () => {
    const { newAnalysis } = await buildValidPayload();
    const created = await analyses.create(newAnalysis);

    await analyses.fail(created.id, "x".repeat(3000));

    const stored = await analyses.findById(created.id);
    expect(stored?.status).toBe("failed");
    expect(stored?.error).toHaveLength(2000);
    expect(stored?.completedAt).toBeDefined();
  });

  it("records a failure message that contains NUL", async () => {
    const { newAnalysis } = await buildValidPayload();
    const created = await analyses.create(newAnalysis);

    // Postgres refuses U+0000 in text: the message is made storable before it is written.
    await analyses.fail(created.id, "boom\u0000");

    const stored = await analyses.findById(created.id);
    expect(stored?.status).toBe("failed");
    expect(stored?.error).toBe("boom");
  });

  it("keeps one product row and unique terms across runs", async () => {
    await analyse();
    await analyse();

    expect(await countAll(t.products)).toBe(1);
    expect(await countAll(t.analyses)).toBe(2);
    const linked = await db.selectDistinct({ productId: t.analyses.productId }).from(t.analyses);
    expect(linked).toHaveLength(1);

    expect(await countAll(t.productTerms)).toBeGreaterThan(0);
    const duplicated = await db
      .select({ term: t.productTerms.term })
      .from(t.productTerms)
      .groupBy(t.productTerms.productId, t.productTerms.term, t.productTerms.language)
      .having(sql`count(*) > 1`);
    expect(duplicated).toEqual([]);
  });

  it("returns a cached payload until it expires, and upserts on write", async () => {
    await cache.set("k", "p", { a: 1 }, 60);
    await cache.set("k", "p", { a: 2 }, 60);

    expect(await cache.get("k")).toEqual({ a: 2 });
    expect(await countAll(t.providerCache)).toBe(1);

    await cache.set("k2", "p", {}, -1);
    expect(await cache.get("k2")).toBeNull();
    expect(await cache.get("missing")).toBeNull();
  });

  it("stores a provider payload once it went through httpJson", async () => {
    // A provider body with a NUL escape or a lone surrogate: Postgres refuses it in jsonb.
    const nul = '{"t":"a\\u0000b"}';
    const surrogate = '{"t":"a\\ud800b"}';
    // 22P05 = untranslatable_character (U+0000), 22P02 = invalid_text_representation (lone surrogate).
    await expect(cache.set("raw-nul", "p", JSON.parse(nul), 60)).rejects.toMatchObject({ cause: { code: "22P05" } });
    await expect(cache.set("raw-surrogate", "p", JSON.parse(surrogate), 60)).rejects.toMatchObject({ cause: { code: "22P02" } });
    expect(await cache.get("raw-nul")).toBeNull();

    // The same bodies, parsed the way httpJson parses them, are stored.
    await cache.set("safe-nul", "p", parseJsonForStorage(nul), 60);
    await cache.set("safe-surrogate", "p", parseJsonForStorage(surrogate), 60);
    expect(await cache.get("safe-nul")).toEqual({ t: "ab" });
    expect(await cache.get("safe-surrogate")).toEqual({ t: "a�b" });
  });

  it("keeps cached() answering when Postgres rejects the payload, and logs the SQLSTATE only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await cached(cache, "k-reject", "provider-x", 60, async () => ok(JSON.parse('{"t":"a\\u0000b-PAYLOAD-VALUE-9"}') as unknown), () => true);

      expect(result).toEqual({ ok: true, data: { t: "a\u0000b-PAYLOAD-VALUE-9" } });
      expect(await cache.get("k-reject")).toBeNull();
      expect(warn).toHaveBeenCalledOnce();
      // Drizzle's message embeds the SQL and its parameters: only the name and the SQLSTATE of the cause reach the log.
      expect(warn.mock.calls[0]).toEqual(["[cache] provider-x write failed: Error (code 22P05)"]);
    } finally {
      warn.mockRestore();
    }
  });
});
