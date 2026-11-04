import "server-only";
import type { ServerEnv } from "@/config/env";
import type { DomainSignals, Visibility } from "@/domain/competitor";
import { coverageOfStatus, sourced, type SourcedValue } from "@/domain/data-nature";
import { registryIndicators, visibilityOf } from "@/engine/competitor/visibility";
import type { DomainMetricsProvider, DomainMetricsQuery, ProviderError } from "@/providers/contracts";
import { createProviderSet } from "@/providers/registry";
import type { CompetitorReadingRepository } from "@/server/repositories/competitor-readings";
import type { ProviderCacheRepository } from "@/server/repositories/types";

/**
 * The parts of a deep competitor check that rest on outside indicators (authority, real-user speed)
 * and on the observatory kept on this computer. Each keyed source the person has not set up is named,
 * never called, and never counted as an answer.
 */

const NO_CACHE: ProviderCacheRepository = { get: async () => null, set: async () => undefined };

export function defaultDomainMetrics(env: ServerEnv, cache: ProviderCacheRepository | null): readonly DomainMetricsProvider[] {
  return createProviderSet({ env, cache: cache ?? NO_CACHE }).domainMetrics;
}

export async function defaultObservatory(): Promise<CompetitorReadingRepository | null> {
  try {
    const { getCompetitorReadings } = await import("@/server/repositories");
    return await getCompetitorReadings();
  } catch {
    return null;
  }
}

/** What a failed source says, as one value that is never read as a zero. */
function failureValue(provider: DomainMetricsProvider, error: ProviderError, observedAt: string): SourcedValue {
  const status = /HTTP (\d{3})/.exec(error.message)?.[1];
  const coverage = error.code === "rate_limited" ? "rate_limited" : error.code === "unauthorized" ? "permission_required" : status ? coverageOfStatus(Number(status)) : "blocked";
  return sourced({ metric: `${provider.meta.id}_status`, value: null, unit: null, nature: "unknown", coverage, source: provider.meta.id, sourceUrl: provider.meta.docsUrl, observedAt, periodStart: null, periodEnd: null, attribution: null });
}

export async function readVisibility(query: DomainMetricsQuery, signals: DomainSignals | null, providers: readonly DomainMetricsProvider[], now: () => number): Promise<Visibility> {
  const observedAt = new Date(now()).toISOString();
  const ready = providers.filter((p) => p.status().state === "ready");
  const notConfigured = providers.filter((p) => p.status().state !== "ready").map((p) => p.meta.id);
  const answers = await Promise.all(
    ready.map(async (provider) => {
      try {
        const result = await provider.getDomainMetrics(query);
        return result.ok ? result.data.values : [failureValue(provider, result.error, observedAt)];
      } catch {
        return [failureValue(provider, { code: "upstream_error", message: "", retryable: true }, observedAt)];
      }
    }),
  );
  return visibilityOf([...registryIndicators(signals, observedAt), ...answers.flat()], notConfigured);
}
