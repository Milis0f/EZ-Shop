import { z } from "zod";
import { missingEnv, type ServerEnv } from "@/config/env";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import { fail, ok, type DomainMetricsObservation, type DomainMetricsProvider, type DomainMetricsQuery, type ProviderMeta, type ProviderResult, type ProviderStatus } from "../contracts";
import { cacheKey, cached, httpJson } from "../http";
import { DOMAIN_METRICS_TTL_S, bareDomain, finite, sourceRefOf, valuesOf } from "./shared";

/**
 * Open PageRank (Keywords Everywhere) — an authority score from 0 to 10 built on Common Crawl's link
 * graph, the domain's rank and its referring domains. A link index, never traffic. Free key, 30 000
 * domains a month. Docs: keywordseverywhere.com/openpagerank/docs (checked 2026-11-04).
 */

const API = "https://openpagerank.keywordseverywhere.com/v1/domains/bulk";
const REQUIRED_ENV = ["OPEN_PAGERANK_API_KEY"] as const satisfies ReadonlyArray<keyof ServerEnv>;

export const openPageRankMeta: ProviderMeta = {
  id: "open-pagerank",
  name: "Open PageRank",
  category: "competitive",
  authMode: "api_key",
  access: "account",
  docsUrl: "https://keywordseverywhere.com/openpagerank/docs",
  qualityTier: 0.5,
  connectorVersion: "0.1.0",
  requiredEnv: [...REQUIRED_ENV],
  coverage: { kind: "all" },
  verification: "documented_unverified",
  maturity: "beta",
  lastVerifiedAt: null,
  termsUrl: null,
  notes: [
    "Score d'autorité de 0 à 10 tiré des liens entre sites (Common Crawl), rang et domaines référents : un indice de notoriété, jamais un trafic.",
    "Clé gratuite, 30 000 domaines par mois ; une clé gratuite ne marche que depuis l'adresse IP déclarée sur le compte.",
  ],
};

const responseSchema = z.object({
  as_of: z.string().nullable().optional(),
  results: z.array(
    z.object({
      domain: z.string(),
      found: z.boolean(),
      open_page_rank: z.number().nullable(),
      rank: z.number().nullable().optional(),
      referring_domains: z.number().nullable().optional(),
    }),
  ),
});

export function parseOpenPageRank(body: unknown, meta: ProviderMeta, query: DomainMetricsQuery, observedAt: string): DomainMetricsObservation | null {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return null;
  const sourceUrl = "https://keywordseverywhere.com/openpagerank/";
  const row = parsed.data.results[0];
  const asOf = parsed.data.as_of ?? null;
  const coverage = row?.found ? ("available" as const) : ("not_covered" as const);
  const values = valuesOf(meta, sourceUrl, "Open PageRank", observedAt, [
    { metric: "open_page_rank", value: row?.found ? finite(row.open_page_rank) : null, unit: "0-10", coverage, periodEnd: asOf },
    { metric: "open_page_rank_position", value: row?.found ? finite(row.rank) : null, unit: "rank", coverage, periodEnd: asOf },
    { metric: "referring_domains", value: row?.found ? finite(row.referring_domains) : null, unit: "domains", coverage, periodEnd: asOf },
  ]);
  return { values, source: sourceRefOf(meta, query, sourceUrl, observedAt) };
}

/** `{ error: { type } }` → its type only. */
function describeError(_status: number, body: string): { reason: string } | undefined {
  try {
    const type = (JSON.parse(body) as { error?: { type?: unknown } }).error?.type;
    return typeof type === "string" ? { reason: type } : undefined;
  } catch {
    return undefined;
  }
}

export class OpenPageRankProvider implements DomainMetricsProvider {
  readonly meta = openPageRankMeta;

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
    if (this.status().state !== "ready") return fail("not_configured", "Open PageRank non configuré.");
    const domain = bareDomain(query.domain);
    if (!domain) return fail("no_data", "Open PageRank : domaine invalide");
    const load = () =>
      httpJson(API, "Open PageRank", {
        timeoutMs: this.timeoutMs,
        method: "POST",
        headers: { Authorization: `Bearer ${this.env.OPEN_PAGERANK_API_KEY ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ domains: [domain], include_history: false }),
        attempts: 1,
        describeError,
      });
    const result = await cached(this.cache, cacheKey(this.meta.id, domain), this.meta.id, DOMAIN_METRICS_TTL_S, load, (p) => responseSchema.safeParse(p).success);
    if (!result.ok) return result;
    const observation = parseOpenPageRank(result.data, this.meta, { ...query, domain }, new Date().toISOString());
    return observation ? ok(observation) : fail("invalid_response", "Open PageRank : réponse inattendue");
  }
}
