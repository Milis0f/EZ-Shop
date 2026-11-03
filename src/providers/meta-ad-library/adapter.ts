import { z } from "zod";
import { missingEnv, type ServerEnv } from "@/config/env";
import { COUNTRIES } from "@/domain/country";
import type { SourceRef } from "@/domain/provenance";
import { aggregateAds, type RawAd } from "../ad-activity";
import {
  fail,
  isCovered,
  ok,
  type AdActivityObservation,
  type AdActivityQuery,
  type AdLibraryProvider,
  type ProviderMeta,
  type ProviderResult,
  type ProviderStatus,
} from "../contracts";
import { type ErrorDescription, httpJson } from "../http";

/**
 * Meta Ad Library API (Graph API `ads_archive`).
 * All ad types are only available for ads delivered in the EU — other countries
 * only expose political/issue ads, so they are out of coverage.
 * Written from the official reference; NOT yet run with a real token.
 * TODO(meta): verify with a real token (identity-verified developer account), record a fixture.
 */

const REQUIRED_ENV = ["META_GRAPH_API_VERSION", "META_AD_LIBRARY_ACCESS_TOKEN"] as const satisfies ReadonlyArray<keyof ServerEnv>;
/**
 * Meta's Ad Library allows about 200 calls an hour and often refuses large pages. At most 6 calls per
 * country keeps an 18-country analysis near 100 calls; beyond that the counts are marked as truncated.
 */
const PAGE_LIMIT = 200;
const MAX_PAGES_PER_TERM = 3;
const MAX_TERMS = 2;

/** Graph API errors come as HTTP 400 with a code: an expired token and a rate limit must not read the same. */
export function describeMetaError(_status: number, body: string): ErrorDescription | undefined {
  let code: unknown;
  try {
    code = (JSON.parse(body) as { error?: { code?: unknown } }).error?.code;
  } catch {
    return undefined;
  }
  if (code === 190 || code === 102) return { reason: "token_expired_or_invalid", code: "unauthorized" };
  if (code === 10 || code === 200 || code === 2332004) return { reason: "permission_denied", code: "unauthorized" };
  if (code === 4 || code === 17 || code === 32 || code === 613) return { reason: "rate_limit", code: "rate_limited" };
  return undefined;
}

export const metaAdLibraryMeta: ProviderMeta = {
  id: "meta-ad-library",
  name: "Meta Ad Library API",
  category: "ad_library",
  authMode: "token",
  access: "approval",
  docsUrl: "https://developers.facebook.com/docs/graph-api/reference/ads_archive/",
  qualityTier: 0.85,
  connectorVersion: "0.1.0",
  requiredEnv: [...REQUIRED_ENV],
  coverage: {
    kind: "list",
    countries: Object.values(COUNTRIES).filter((c) => c.isEU).map((c) => c.code),
    note: "Toutes les publicités : pays de l'UE uniquement (DSA). Hors UE : publicités politiques seulement.",
  },
  verification: "documented_unverified",
  notes: [
    "Mesure la présence publicitaire visible (annonces, annonceurs), jamais les ventes ni les budgets.",
    "Compte développeur vérifié + jeton d'accès requis.",
  ],
};

const adSchema = z.object({
  id: z.string(),
  page_id: z.string(),
  ad_delivery_start_time: z.string(),
  ad_delivery_stop_time: z.string().optional(),
});
const pageSchema = z.object({
  data: z.array(adSchema),
  paging: z.object({ next: z.string().optional() }).optional(),
});

export class MetaAdLibraryProvider implements AdLibraryProvider {
  readonly meta = metaAdLibraryMeta;
  readonly platform = "meta" as const;

  constructor(
    private readonly env: ServerEnv,
    private readonly timeoutMs: number,
  ) {}

  status(): ProviderStatus {
    const missing = missingEnv(this.env, REQUIRED_ENV);
    if (missing.length > 0) return { state: "not_configured", detail: `Variables manquantes : ${missing.join(", ")}` };
    return { state: "ready", detail: "Configuré — connecteur écrit depuis la doc, jamais vérifié en réel." };
  }

  async getAdActivity(query: AdActivityQuery): Promise<ProviderResult<AdActivityObservation>> {
    if (!isCovered(this.meta, query.country)) {
      return fail("unsupported_country", "Meta Ad Library : toutes publicités disponibles pour l'UE uniquement.");
    }
    if (this.status().state !== "ready") return fail("not_configured", "Meta Ad Library non configurée.");

    const ads: RawAd[] = [];
    let truncated = false;
    for (const term of query.terms.slice(0, MAX_TERMS)) {
      const result = await this.collectTerm(term, query);
      if (!result.ok) return result;
      ads.push(...result.data.ads);
      truncated ||= result.data.truncated;
    }

    const today = new Date().toISOString().slice(0, 10);
    const source: SourceRef = {
      sourceId: this.meta.id,
      origin: "live",
      collectedAt: new Date().toISOString(),
      connectorVersion: this.meta.connectorVersion,
      queryRef: `ads_archive/${query.country}/${query.terms.slice(0, MAX_TERMS).join("|")}`,
      sourceUrl: "https://www.facebook.com/ads/library/",
      period: { start: query.since, end: today },
    };
    return ok({ ...aggregateAds(ads, today, query.since), truncated, source });
  }

  private async collectTerm(
    term: string,
    query: AdActivityQuery,
  ): Promise<ProviderResult<{ ads: RawAd[]; truncated: boolean }>> {
    const params = new URLSearchParams({
      search_terms: term.slice(0, 100),
      ad_reached_countries: JSON.stringify([query.country]),
      ad_type: "ALL",
      ad_active_status: "ALL",
      ad_delivery_date_min: query.since,
      fields: "id,page_id,ad_delivery_start_time,ad_delivery_stop_time",
      limit: String(PAGE_LIMIT),
      access_token: this.env.META_AD_LIBRARY_ACCESS_TOKEN ?? "",
    });
    let url: string | undefined = `https://graph.facebook.com/${this.env.META_GRAPH_API_VERSION}/ads_archive?${params}`;
    const ads: RawAd[] = [];

    for (let page = 0; url && page < MAX_PAGES_PER_TERM; page += 1) {
      // The label never includes the URL: it carries the access token.
      const raw = await httpJson(url, `Meta ads_archive (${query.country})`, { timeoutMs: this.timeoutMs, describeError: describeMetaError });
      if (!raw.ok) return raw;
      const parsed = pageSchema.safeParse(raw.data);
      if (!parsed.success) return fail("invalid_response", "Meta ads_archive: unexpected response shape");
      ads.push(
        ...parsed.data.data.map((ad) => ({
          id: ad.id,
          advertiserId: ad.page_id,
          startDate: ad.ad_delivery_start_time.slice(0, 10),
          stopDate: ad.ad_delivery_stop_time?.slice(0, 10),
        })),
      );
      url = parsed.data.paging?.next;
    }
    return ok({ ads, truncated: url !== undefined });
  }
}
