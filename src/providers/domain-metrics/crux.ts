import { z } from "zod";
import { missingEnv, type ServerEnv } from "@/config/env";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import { fail, ok, type DomainMetricsObservation, type DomainMetricsProvider, type DomainMetricsQuery, type ProviderMeta, type ProviderResult, type ProviderStatus } from "../contracts";
import { cacheKey, cached, httpText } from "../http";
import { describeGoogleApiError } from "../youtube/adapter";
import { DOMAIN_METRICS_TTL_S, bareDomain, finite, sourceRefOf, valuesOf } from "./shared";

/**
 * Chrome UX Report API — how fast the shop is for its real Chrome visitors (p75 over the last 28 days).
 * Free Google Cloud key, 150 requests a minute per project. An origin without enough Chrome traffic is
 * not in the report: that absence is itself a sign of a small audience, shown as "not covered", never
 * as zero visitors. Docs: developer.chrome.com/docs/crux/guides/crux-api (checked 2026-11-04).
 */

const API = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
const REQUIRED_ENV = ["CRUX_API_KEY"] as const satisfies ReadonlyArray<keyof ServerEnv>;

export const cruxMeta: ProviderMeta = {
  id: "chrome-ux-report",
  name: "Chrome UX Report API",
  category: "competitive",
  authMode: "api_key",
  access: "account",
  docsUrl: "https://developer.chrome.com/docs/crux/guides/crux-api",
  qualityTier: 0.8,
  connectorVersion: "0.1.0",
  requiredEnv: [...REQUIRED_ENV],
  coverage: { kind: "all" },
  verification: "documented_unverified",
  maturity: "beta",
  lastVerifiedAt: null,
  termsUrl: "https://developers.google.com/terms",
  notes: [
    "Vitesse réelle du site pour ses visiteurs Chrome (p75 sur 28 jours) ; absent du rapport = trop peu de visiteurs Chrome pour être mesuré.",
    "Clé Google Cloud gratuite, 150 requêtes par minute et par projet.",
  ],
};

const dateSchema = z.object({ year: z.number(), month: z.number(), day: z.number() });
const metricSchema = z.object({ percentiles: z.object({ p75: z.union([z.number(), z.string()]) }).optional() });
const recordSchema = z.object({
  record: z.object({
    metrics: z.record(z.string(), metricSchema).default({}),
    collectionPeriod: z.object({ firstDate: dateSchema, lastDate: dateSchema }).optional(),
  }),
});

const isoDay = (d: z.infer<typeof dateSchema>): string => `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

const METRICS = [
  ["largest_contentful_paint", "crux_lcp_p75", "ms"],
  ["interaction_to_next_paint", "crux_inp_p75", "ms"],
  ["cumulative_layout_shift", "crux_cls_p75", null],
] as const;

export function parseCrux(body: unknown, meta: ProviderMeta, query: DomainMetricsQuery, sourceUrl: string, observedAt: string): DomainMetricsObservation | null {
  const parsed = recordSchema.safeParse(body);
  if (!parsed.success) return null;
  const period = parsed.data.record.collectionPeriod;
  const periodStart = period ? isoDay(period.firstDate) : null;
  const periodEnd = period ? isoDay(period.lastDate) : null;
  const values = valuesOf(meta, sourceUrl, null, observedAt, [
    { metric: "crux_presence", value: 1, unit: null, coverage: "available", periodStart, periodEnd },
    ...METRICS.map(([key, metric, unit]) => {
      const value = finite(parsed.data.record.metrics[key]?.percentiles?.p75);
      return { metric, value, unit, coverage: value === null ? ("insufficient_data" as const) : ("available" as const), periodStart, periodEnd };
    }),
  ]);
  return { values, source: sourceRefOf(meta, query, sourceUrl, observedAt) };
}

export class CruxProvider implements DomainMetricsProvider {
  readonly meta = cruxMeta;

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
    if (this.status().state !== "ready") return fail("not_configured", "Chrome UX Report non configuré.");
    const domain = bareDomain(query.domain);
    if (!domain) return fail("no_data", "Chrome UX Report : domaine invalide");
    const origin = /^https:\/\/[^/]+$/i.test(query.origin) ? query.origin.toLowerCase() : `https://${domain}`;
    const sourceUrl = `https://developer.chrome.com/docs/crux`;
    // The answer is cached as text: "not in the report" (404) is a real answer and is kept too.
    const load = async (): Promise<ProviderResult<string>> => {
      const answer = await httpText(`${API}?key=${encodeURIComponent(this.env.CRUX_API_KEY ?? "")}`, "Chrome UX Report", {
        timeoutMs: this.timeoutMs,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin }),
        attempts: 1,
        describeError: describeGoogleApiError,
      });
      if (!answer.ok && answer.error.code === "no_data" && /HTTP 404/.test(answer.error.message)) return ok("NOT_FOUND");
      return answer;
    };
    const result = await cached(this.cache, cacheKey(this.meta.id, origin), this.meta.id, DOMAIN_METRICS_TTL_S, load, (text) => typeof text === "string" && text.length > 0);
    if (!result.ok) return result;
    const observedAt = new Date().toISOString();
    if (result.data === "NOT_FOUND") {
      return ok({ values: valuesOf(this.meta, sourceUrl, null, observedAt, [{ metric: "crux_presence", value: null, unit: null, coverage: "not_covered" }]), source: sourceRefOf(this.meta, query, sourceUrl, observedAt) });
    }
    let body: unknown;
    try {
      body = JSON.parse(result.data);
    } catch {
      return fail("invalid_response", "Chrome UX Report : réponse illisible");
    }
    const observation = parseCrux(body, this.meta, query, sourceUrl, observedAt);
    return observation ? ok(observation) : fail("invalid_response", "Chrome UX Report : réponse inattendue");
  }
}
