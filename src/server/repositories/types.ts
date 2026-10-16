import type {
  AnalysisResult,
  AnalysisSummary,
  DataMode,
  ProviderStatusSnapshot,
  UnitEconomics,
} from "@/domain/analysis";
import type { CountryCode } from "@/domain/country";
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
}

export interface ProviderCacheRepository {
  get(key: string): Promise<unknown | null>;
  set(key: string, providerId: string, payload: unknown, ttlSeconds: number): Promise<void>;
}

export interface Repositories {
  readonly analyses: AnalysisRepository;
  readonly cache: ProviderCacheRepository;
}
