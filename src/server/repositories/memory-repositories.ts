import type { AnalysisResult, AnalysisSummary } from "@/domain/analysis";
import { isKnown } from "@/domain/datum";
import { toSummary } from "./summary";
import type {
  AnalysisRepository,
  CompletedAnalysis,
  CreatedAnalysis,
  NewAnalysis,
  NewRun,
  ProviderCacheRepository,
  Repositories,
  ResearchRunRepository,
  RunFinish,
  RunListQuery,
  RunRecord,
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

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
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
          results: result?.countries,
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

export class MemoryResearchRunRepository implements ResearchRunRepository {
  private readonly store = new Map<string, RunRecord>();
  private sequence = 0;

  async start(run: NewRun): Promise<string> {
    this.sequence += 1;
    const id = `00000000-0000-4000-9000-${String(this.sequence).padStart(12, "0")}`;
    const now = new Date().toISOString();
    const { status = "running", ...fields } = run;
    this.store.set(id, { ...fields, id, status, result: null, sourceCount: null, model: null, error: null, progress: null, step: null, durationMs: null, createdAt: now, startedAt: status === "pending" ? null : now, finishedAt: null });
    return id;
  }

  async finish(id: string, finish: RunFinish): Promise<void> {
    const run = this.store.get(id);
    if (!run) return;
    this.store.set(id, { ...run, status: finish.status, result: finish.result ?? null, sourceCount: finish.sourceCount ?? null, model: finish.model ?? null, error: finish.error ?? null, durationMs: finish.durationMs ?? null, finishedAt: new Date().toISOString() });
  }

  async findById(id: string): Promise<RunRecord | null> {
    return this.store.get(id) ?? null;
  }

  async list(query: RunListQuery): Promise<RunRecord[]> {
    const q = query.q?.toLowerCase();
    return [...this.store.values()]
      .filter((r) => (!query.kind || r.kind === query.kind) && (!q || r.title.toLowerCase().includes(q)))
      .toSorted((a, b) => (query.order === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)))
      .slice(0, query.limit);
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async markInterrupted(startedBefore: Date): Promise<number> {
    let count = 0;
    for (const run of this.store.values()) {
      if (run.status === "running" && (run.startedAt ?? run.createdAt) < startedBefore.toISOString()) {
        this.store.set(run.id, { ...run, status: "interrupted", finishedAt: new Date().toISOString() });
        count += 1;
      }
    }
    return count;
  }

  async claimNext(): Promise<RunRecord | null> {
    const next = [...this.store.values()].filter((r) => r.status === "pending").toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
    if (!next) return null;
    const claimed: RunRecord = { ...next, status: "running", startedAt: new Date().toISOString(), progress: 0 };
    this.store.set(next.id, claimed);
    return claimed;
  }

  async progress(id: string, progress: number, step: string | null): Promise<void> {
    const run = this.store.get(id);
    if (run?.status === "running") this.store.set(id, { ...run, progress, step });
  }

  async cancelPending(id: string): Promise<boolean> {
    const run = this.store.get(id);
    if (run?.status !== "pending") return false;
    this.store.set(id, { ...run, status: "cancelled", finishedAt: new Date().toISOString() });
    return true;
  }
}

export function createMemoryRepositories(): Repositories & { analyses: MemoryAnalysisRepository } {
  return { analyses: new MemoryAnalysisRepository(), cache: new MemoryCacheRepository(), runs: new MemoryResearchRunRepository() };
}
