import "server-only";
import type { ServerEnv } from "@/config/env";
import type { StoreWebResult } from "@/domain/store";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import { defaultDomainMetrics, readVisibility } from "@/server/web/competitor-extras";
import { readDomainSignals } from "@/server/web/domain-signals";
import { createSiteReader, DEFAULT_FETCH_DEPS } from "@/server/web/safe-fetch";
import { readSiteMap } from "@/server/web/site-map";
import { detectTechnologies } from "@/server/web/technologies";

/**
 * The owner's store read the way EZ-Shop reads a competitor: its domain's registries, the published
 * indicators the owner set keys for, what its sitemaps declare and the technologies its home page
 * shows. Observed or published; never a number of visits. Kept one hour.
 */

const CACHE_MS = 60 * 60 * 1000;
const PACE_MS = 1_000;
const kept = new Map<string, { until: number; result: StoreWebResult }>();

async function sharedCache(): Promise<ProviderCacheRepository | null> {
  try {
    const { getRepositories } = await import("@/server/repositories");
    return (await getRepositories()).cache;
  } catch {
    return null;
  }
}

export async function readStoreWeb(origin: string | null, env: ServerEnv, now: () => number = Date.now): Promise<StoreWebResult> {
  if (!origin) return { ok: false, code: "no_public_store" };
  const known = kept.get(origin);
  if (known && known.until > now()) return known.result;
  const domain = new URL(origin).hostname.replace(/^www\./, "");
  const cache = await sharedCache();
  const site = createSiteReader(DEFAULT_FETCH_DEPS, undefined, PACE_MS);
  const home = await site.read(origin, "text/html,*/*;q=0.5");
  if (!home.ok && home.code !== "robots") return { ok: false, code: "unreachable" };
  const [signalsRead, siteMap] = await Promise.all([readDomainSignals(domain, { fetch: (input, init) => fetch(input, init), cache }).catch(() => null), readSiteMap(origin, site).catch(() => null)]);
  const signals = signalsRead?.signals ?? null;
  const visibility = await readVisibility({ domain, origin }, signals, defaultDomainMetrics(env, cache), now).catch(() => null);
  const result: StoreWebResult = {
    ok: true,
    web: { domain, signals, visibility, siteMap, technologies: home.ok ? detectTechnologies(home.body) : [], readAt: new Date(now()).toISOString() },
  };
  kept.set(origin, { until: now() + CACHE_MS, result });
  return result;
}
