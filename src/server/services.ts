import "server-only";
import { getEnv } from "@/config/env";
import type { AnalysisResult, AnalysisSummary } from "@/domain/analysis";
import type { ProviderMeta, ProviderStatus } from "@/providers/contracts";
import { createProviderSet, listProviders, REAL_PROVIDER_METAS } from "@/providers/registry";
import { runAnalysis } from "./pipeline/run-analysis";
import { getRepositories, type ProviderCacheRepository } from "./repositories";

/** Application services used by pages, server actions and route handlers. */

export async function createAnalysis(raw: unknown): Promise<AnalysisResult> {
  const repositories = await getRepositories();
  return runAnalysis(raw, { repositories, env: getEnv() });
}

export async function getAnalysis(id: string): Promise<AnalysisResult | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const repositories = await getRepositories();
  return repositories.analyses.findById(id);
}

export async function listRecentAnalyses(limit = 12): Promise<AnalysisSummary[]> {
  const repositories = await getRepositories();
  return repositories.analyses.listRecent(limit);
}

export interface ConnectorOverview {
  readonly meta: ProviderMeta;
  readonly status: ProviderStatus;
}

/** Status checks never fetch: a cache that is never read is enough to build the set. */
const STATUS_ONLY_CACHE: ProviderCacheRepository = { get: async () => null, set: async () => undefined };

/** Live connector states. Building the set performs no network or database call. */
export async function getConnectorOverview(): Promise<{ connectors: ConnectorOverview[] }> {
  const env = getEnv();
  const live = createProviderSet({ env, cache: STATUS_ONLY_CACHE });
  const byId = new Map(listProviders(live).map((p) => [p.meta.id, p.status()]));
  return {
    connectors: REAL_PROVIDER_METAS.map((meta) => ({
      meta,
      status: byId.get(meta.id) ?? { state: "not_implemented", detail: "Non enregistré." },
    })),
  };
}
