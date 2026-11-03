import "server-only";
import { z } from "zod";
import { getEnv } from "@/config/env";
import type { ProviderId } from "@/domain/provenance";
import { probeFor, runProbe, type HealthResult } from "@/providers/health-probes";
import { createProviderSet } from "@/providers/registry";
import { getRepositories, type ProviderCacheRepository } from "./repositories";

/**
 * "Test now": one real business read per source, against the live service, never the analysis cache.
 * The last outcome of each source is kept (provider_cache, 90 days) so the page can say when a source
 * was last seen working on this computer. A present key is never taken as a working source.
 */

const KEPT_SECONDS = 90 * 24 * 3600;
const healthKey = (id: ProviderId) => `health:${id}`;
const NO_CACHE: ProviderCacheRepository = { get: async () => null, set: async () => undefined };

const keptSchema = z.object({
  id: z.string(),
  outcome: z.enum(["ok", "empty", "failed"]),
  code: z.string().nullable(),
  ms: z.number().nonnegative(),
  testedAt: z.string(),
});

export async function testConnectorHealth(id: ProviderId): Promise<HealthResult | null> {
  const set = createProviderSet({ env: getEnv(), cache: NO_CACHE });
  const probe = probeFor(set, id);
  if (!probe) return null;
  const result = await runProbe(id, probe);
  try {
    await (await getRepositories()).cache.set(healthKey(id), "connector-health", result, KEPT_SECONDS);
  } catch (error: unknown) {
    console.error("[health] result not kept", error instanceof Error ? error.name : typeof error);
  }
  return result;
}

/** The last kept test of each source; a source never tested here is absent. */
export async function lastHealth(ids: readonly ProviderId[]): Promise<ReadonlyMap<ProviderId, HealthResult>> {
  try {
    const { cache } = await getRepositories();
    const found = await Promise.all(
      ids.map(async (id) => {
        const parsed = keptSchema.safeParse(await cache.get(healthKey(id)));
        return parsed.success ? ([id, { ...parsed.data, id }] as const) : null;
      }),
    );
    return new Map(found.filter((e): e is NonNullable<typeof e> => e !== null));
  } catch {
    return new Map();
  }
}
