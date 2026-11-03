import type {
  AnalysisResult,
  AnalysisSummary,
  DataMode,
  ProviderStatusSnapshot,
  UnitEconomics,
} from "@/domain/analysis";
import type { CountryCode } from "@/domain/country";
import type { RunKind, RunStatus } from "@/domain/history";
import type { ProductQuery } from "@/domain/product";
import type { DataOrigin, ProviderId } from "@/domain/provenance";
import type { AnalysisInput } from "@/domain/schemas";
import type { ProviderMeta } from "@/providers/contracts";

/** Flat raw value as collected, persisted for audit (one row per point). */
export interface ObservationRecord {
  readonly providerId: ProviderId;
  readonly country: CountryCode;
  readonly metric: string;
  readonly term?: string;
  readonly periodStart?: string;
  readonly periodEnd?: string;
  readonly value: number;
  readonly unit: string;
  readonly origin: DataOrigin;
  readonly queryRef?: string;
  readonly sourceUrl?: string;
  readonly connectorVersion: string;
  readonly collectedAt: string;
}

export interface CompetitionSnapshotRecord {
  readonly providerId: ProviderId;
  readonly country: CountryCode;
  readonly activeAds: number;
  readonly uniqueAdvertisers: number;
  readonly origin: DataOrigin;
}

export interface NewAnalysis {
  readonly product: ProductQuery;
  readonly input: AnalysisInput;
  readonly economics: UnitEconomics;
  readonly dataMode: DataMode;
  readonly modelVersion: string;
  readonly providers: readonly ProviderStatusSnapshot[];
  readonly providerMetas: readonly ProviderMeta[];
}

export interface CreatedAnalysis {
  readonly id: string;
  readonly productId: string;
  readonly createdAt: string;
}

export interface CompletedAnalysis {
  readonly result: AnalysisResult;
  readonly productId: string;
  readonly observations: readonly ObservationRecord[];
  readonly snapshots: readonly CompetitionSnapshotRecord[];
}

export interface AnalysisRepository {
  create(analysis: NewAnalysis): Promise<CreatedAnalysis>;
  complete(completed: CompletedAnalysis): Promise<void>;
  fail(id: string, error: string): Promise<void>;
  findById(id: string): Promise<AnalysisResult | null>;
  listRecent(limit: number): Promise<AnalysisSummary[]>;
  /** Removes an analysis and everything computed for it (country results, observations…). */
  delete(id: string): Promise<boolean>;
}

export interface NewRun {
  readonly kind: RunKind;
  readonly title: string;
  readonly locale: string;
  readonly countries: readonly string[];
  readonly params: unknown;
  /** "pending": queued for the background worker; "running" (default): run right away by the caller. */
  readonly status?: "pending" | "running";
}

export interface RunFinish {
  readonly status: Exclude<RunStatus, "pending" | "running">;
  readonly result?: unknown;
  readonly sourceCount?: number;
  readonly model?: string | null;
  readonly error?: string;
  readonly durationMs?: number;
}

export interface RunRecord {
  readonly id: string;
  readonly kind: RunKind;
  readonly title: string;
  readonly status: RunStatus;
  readonly locale: string;
  readonly countries: readonly string[];
  readonly params: unknown;
  /** The stored report: validate it with its domain schema before use. */
  readonly result: unknown;
  readonly sourceCount: number | null;
  readonly model: string | null;
  readonly error: string | null;
  readonly progress: number | null;
  readonly step: string | null;
  readonly durationMs: number | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

export interface RunListQuery {
  readonly kind?: RunKind;
  readonly q?: string;
  readonly order: "newest" | "oldest";
  readonly limit: number;
}

/** Deep research, competitor checks and web searches kept for the history (`research_runs`). */
export interface ResearchRunRepository {
  start(run: NewRun): Promise<string>;
  finish(id: string, finish: RunFinish): Promise<void>;
  findById(id: string): Promise<RunRecord | null>;
  list(query: RunListQuery): Promise<RunRecord[]>;
  delete(id: string): Promise<boolean>;
  /**
   * Runs started before `startedBefore` and still running (the app stopped meanwhile) become interrupted.
   * Pending ones stay pending: nothing of them ran, the worker can take them without doing anything twice.
   */
  markInterrupted(startedBefore: Date): Promise<number>;
  /** Takes the oldest pending run and marks it running; null when none waits. */
  claimNext(): Promise<RunRecord | null>;
  /** Where a running run is: a share from 0 to 1 and the step under way. */
  progress(id: string, progress: number, step: string | null): Promise<void>;
  /** Cancels a run that has not started yet; false when it already started or ended. */
  cancelPending(id: string): Promise<boolean>;
}

export interface ProviderCacheRepository {
  get(key: string): Promise<unknown | null>;
  set(key: string, providerId: string, payload: unknown, ttlSeconds: number): Promise<void>;
}

export interface Repositories {
  readonly analyses: AnalysisRepository;
  readonly cache: ProviderCacheRepository;
  readonly runs: ResearchRunRepository;
}
