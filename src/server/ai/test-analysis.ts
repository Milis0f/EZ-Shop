import type { ServerEnv } from "@/config/env";
import type { AnalysisResult } from "@/domain/analysis";
import type { CountryCode } from "@/domain/country";
import { createProviderSet } from "@/providers/registry";
import { runAnalysis } from "@/server/pipeline/run-analysis";
import { createMemoryRepositories } from "@/server/repositories/memory-repositories";
import { TEST_NOW } from "@/test/fixtures";

const devEnv = { NODE_ENV: "development", PGLITE_DATA_DIR: ".data/test", PROVIDER_HTTP_TIMEOUT_MS: 1000 } as ServerEnv;

/**
 * Tests only: a completed analysis built offline from the mock providers (development fixtures, not market
 * data), stored as a mock analysis. The offline fixtures go through the providers seam, so this does not
 * depend on the form still accepting `dataMode: "mock"`; stored analyses may still say `mock`.
 */
export async function mockStoredAnalysis(
  countries: readonly CountryCode[],
  economics: Readonly<Record<string, number | string>> = { currency: "EUR" },
): Promise<AnalysisResult> {
  const repositories = createMemoryRepositories();
  const providers = createProviderSet("mock", { env: devEnv, cache: repositories.cache, now: () => TEST_NOW });
  const result = await runAnalysis(
    { productName: "Chaussettes chauffantes", countries, economics },
    { repositories, env: devEnv, now: () => TEST_NOW, providers },
  );
  return { ...result, dataMode: "mock" };
}
