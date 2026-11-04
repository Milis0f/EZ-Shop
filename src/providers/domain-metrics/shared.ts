import { sourced, type CoverageState, type DataNature, type SourcedValue } from "@/domain/data-nature";
import type { SourceRef } from "@/domain/provenance";
import type { DomainMetricsQuery, ProviderMeta } from "../contracts";

/** Kept a week on this computer only: authority and speed move slowly, and quotas are monthly. */
export const DOMAIN_METRICS_TTL_S = 7 * 24 * 3600;

/** A domain as these sources expect it: lower case, no scheme, no `www.`. */
export function bareDomain(domain: string): string | null {
  const value = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  return /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(value) ? value : null;
}

export interface ValueSpec {
  readonly metric: string;
  readonly value: number | null;
  readonly unit: string | null;
  readonly nature?: DataNature;
  readonly coverage: CoverageState;
  readonly periodStart?: string | null;
  readonly periodEnd?: string | null;
}

export function valuesOf(meta: ProviderMeta, sourceUrl: string, attribution: string | null, observedAt: string, specs: readonly ValueSpec[]): SourcedValue[] {
  return specs.map((s) =>
    sourced({
      metric: s.metric,
      value: s.value,
      unit: s.unit,
      nature: s.nature ?? "published",
      coverage: s.coverage,
      source: meta.id,
      sourceUrl,
      observedAt,
      periodStart: s.periodStart ?? null,
      periodEnd: s.periodEnd ?? null,
      attribution,
    }),
  );
}

export function sourceRefOf(meta: ProviderMeta, query: DomainMetricsQuery, sourceUrl: string, collectedAt: string): SourceRef {
  return { sourceId: meta.id, origin: "live", collectedAt, connectorVersion: meta.connectorVersion, queryRef: `domain/${query.domain}`, sourceUrl };
}

export const finite = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};
