import type { AnalysisResult, AnalysisSummary } from "@/domain/analysis";
import { isKnown } from "@/domain/datum";
import { toSummary } from "./summary";
import type {
  AnalysisRepository,
  CompletedAnalysis,
  CreatedAnalysis,
  NewAnalysis,
  ProviderCacheRepository,
  Repositories,
} from "./types";

/** In-memory implementations — used by tests; no persistence across restarts. */

interface StoredAnalysis {
  readonly base: NewAnalysis & CreatedAnalysis;
  readonly result?: AnalysisResult;
  readonly error?: string;
  readonly completed?: CompletedAnalysis;
}

export class MemoryAnalysisRepository implements AnalysisRepository {
  private readonly store = new Map<string, StoredAnalysis>();
  private sequence = 0;

  async create(analysis: NewAnalysis): Promise<CreatedAnalysis> {
    this.sequence += 1;
    const created: CreatedAnalysis = {
      id: `00000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`,
      productId: `product-${analysis.product.canonicalKey}`,
      createdAt: new Date().toISOString(),
    };
    this.store.set(created.id, { base: { ...analysis, ...created } });
    return created;
  }

  async complete(completed: CompletedAnalysis): Promise<void> {
    const entry = this.require(completed.result.id);
    this.store.set(completed.result.id, { ...entry, result: completed.result, completed });
  }

  async fail(id: string, error: string): Promise<void> {
    this.store.set(id, { ...this.require(id), error });
  }

  async findById(id: string): Promise<AnalysisResult | null> {
    return this.store.get(id)?.result ?? null;
  }

  async listRecent(limit: number): Promise<AnalysisSummary[]> {
    return [...this.store.values()]
      .toSorted((a, b) => b.base.createdAt.localeCompare(a.base.createdAt))
      .slice(0, limit)
      .map(({ base, result, error }) =>
        toSummary({
          id: base.id,
          productName: base.product.displayName,
          status: result ? "completed" : error ? "failed" : "running",
          dataMode: base.dataMode,
          countryCount: base.input.countries.length,
          createdAt: base.createdAt,
          scores: (result?.countries ?? []).map((c) => ({
            countryCode: c.country,
            opportunityScore: isKnown(c.scoring.score) ? c.scoring.score.value.total : null,
            confidenceScore: c.scoring.confidence.score,
          })),
        }),
      );
  }

  /** Test helper: what the pipeline asked to persist. */
  persisted(id: string): CompletedAnalysis | undefined {
    return this.store.get(id)?.completed;
  }

  private require(id: string): StoredAnalysis {
    const entry = this.store.get(id);
    if (!entry) throw new Error(`Unknown analysis ${id}`);
    return entry;
  }
}

export class MemoryCacheRepository implements ProviderCacheRepository {
  private readonly store = new Map<string, { payload: unknown; expiresAt: number }>();

  async get(key: string): Promise<unknown | null> {
    const entry = this.store.get(key);
    return entry && entry.expiresAt > Date.now() ? entry.payload : null;
  }

  async set(key: string, _providerId: string, payload: unknown, ttlSeconds: number): Promise<void> {
    this.store.set(key, { payload, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

export function createMemoryRepositories(): Repositories & { analyses: MemoryAnalysisRepository } {
  return { analyses: new MemoryAnalysisRepository(), cache: new MemoryCacheRepository() };
}
