import { z } from "zod";
import { missingEnv, type ServerEnv } from "@/config/env";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import { fail, ok, type DomainMetricsObservation, type DomainMetricsProvider, type DomainMetricsQuery, type ProviderMeta, type ProviderResult, type ProviderStatus } from "../contracts";
import { cacheKey, cached, httpJson } from "../http";
import { DOMAIN_METRICS_TTL_S, bareDomain, finite, sourceRefOf, valuesOf } from "./shared";

/**
 * Ahrefs public API, `domain-rating-free` — the strength of a domain's backlinks from 0 to 100, free with
 * a free APIv3 key. A link index, not traffic. Attribution "Domain Rating by Ahrefs" is required next
 * to the value. Docs: docs.ahrefs.com/en/api/reference/public/get-domain-rating-free (checked 2026-11-04).
 */

const API = "https://api.ahrefs.com/v3/public/domain-rating-free";
const REQUIRED_ENV = ["AHREFS_API_KEY"] as const satisfies ReadonlyArray<keyof ServerEnv>;
export const AHREFS_ATTRIBUTION = "Domain Rating by Ahrefs";

export const ahrefsMeta: ProviderMeta = {
  id: "ahrefs-domain-rating",
  name: "Ahrefs — Domain Rating (free)",
  category: "competitive",
  authMode: "api_key",
  access: "account",
  docsUrl: "https://docs.ahrefs.com/en/api/reference/public/get-domain-rating-free",
  qualityTier: 0.6,
  connectorVersion: "0.1.0",
  requiredEnv: [...REQUIRED_ENV],
  coverage: { kind: "all" },
  verification: "documented_unverified",
  maturity: "beta",
  lastVerifiedAt: null,
  termsUrl: null,
  notes: [
    "Force des liens entrants du domaine de 0 à 100 (index Ahrefs) : un indice de notoriété, jamais un trafic. Mention « Domain Rating by Ahrefs » affichée.",
    "Point d'accès gratuit, avec une clé API v3 gratuite.",
  ],
};

const responseSchema = z.object({ domain_rating: z.object({ domain_rating: z.number().nullable(), license: z.string().optional() }) });

export function parseAhrefs(body: unknown, meta: ProviderMeta, query: DomainMetricsQuery, observedAt: string): DomainMetricsObservation | null {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return null;
  const sourceUrl = "https://ahrefs.com/website-authority-checker";
  const value = finite(parsed.data.domain_rating.domain_rating);
  const values = valuesOf(meta, sourceUrl, AHREFS_ATTRIBUTION, observedAt, [{ metric: "ahrefs_domain_rating", value, unit: "0-100", coverage: value === null ? "not_covered" : "available" }]);
  return { values, source: sourceRefOf(meta, query, sourceUrl, observedAt) };
}

function describeError(_status: number, body: string): { reason: string } | undefined {
  try {
    const error = (JSON.parse(body) as { error?: unknown }).error;
    return typeof error === "string" && /^[A-Za-z][\w.]{1,63}$/.test(error) ? { reason: error } : undefined;
  } catch {
    return undefined;
  }
}

export class AhrefsDomainRatingProvider implements DomainMetricsProvider {
  readonly meta = ahrefsMeta;

  constructor(
    private readonly env: ServerEnv,
    private readonly cache: ProviderCacheRepository,
    private readonly timeoutMs: number,
  ) {}

  status(): ProviderStatus {
    const missing = missingEnv(this.env, REQUIRED_ENV);
    if (missing.length > 0) return { state: "not_configured", detail: `Variables manquantes : ${missing.join(", ")}` };
    return { state: "ready", detail: "Configuré — écrit depuis la doc officielle." };
  }

  async getDomainMetrics(query: DomainMetricsQuery): Promise<ProviderResult<DomainMetricsObservation>> {
    if (this.status().state !== "ready") return fail("not_configured", "Ahrefs non configuré.");
    const domain = bareDomain(query.domain);
    if (!domain) return fail("no_data", "Ahrefs : domaine invalide");
    const url = `${API}?${new URLSearchParams({ target: domain, output: "json" }).toString()}`;
    const load = () => httpJson(url, "Ahrefs Domain Rating", { timeoutMs: this.timeoutMs, headers: { Authorization: `Bearer ${this.env.AHREFS_API_KEY ?? ""}`, Accept: "application/json" }, attempts: 1, describeError });
    const result = await cached(this.cache, cacheKey(this.meta.id, domain), this.meta.id, DOMAIN_METRICS_TTL_S, load, (p) => responseSchema.safeParse(p).success);
    if (!result.ok) return result;
    const observation = parseAhrefs(result.data, this.meta, { ...query, domain }, new Date().toISOString());
    return observation ? ok(observation) : fail("invalid_response", "Ahrefs : réponse inattendue");
  }
}
