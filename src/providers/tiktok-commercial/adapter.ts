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
import { httpJson } from "../http";

/**
 * TikTok Commercial Content API (Research API — ad library), EU ads.
 * Requires an approved application (client key/secret, client-credentials token).
 * Written from the official docs; NOT yet run with real credentials.
 * TODO(tiktok): verify field names with an approved app, record a fixture, mark "live_verified".
 */

const REQUIRED_ENV = ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"] as const satisfies ReadonlyArray<keyof ServerEnv>;
const API = "https://open.tiktokapis.com/v2";
const MAX_PAGES = 5;
const PAGE_SIZE = 50;

export const tiktokCommercialMeta: ProviderMeta = {
  id: "tiktok-commercial-content",
  name: "TikTok Commercial Content API",
  category: "ad_library",
  authMode: "oauth",
  access: "approval",
  docsUrl: "https://developers.tiktok.com/doc/commercial-content-api-getting-started/",
  qualityTier: 0.8,
  connectorVersion: "0.1.0",
  requiredEnv: [...REQUIRED_ENV],
  coverage: {
    kind: "list",
    countries: Object.values(COUNTRIES).filter((c) => c.isEU).map((c) => c.code),
    note: "Publicités diffusées dans l'UE.",
  },
  verification: "documented_unverified",
  notes: ["Présence publicitaire visible (annonces, annonceurs, dates). Candidature et approbation requises."],
};

const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().optional() });
const querySchema = z.object({
  data: z.object({
    ads: z.array(
      z.object({
        ad: z.object({ id: z.union([z.string(), z.number()]), first_shown_date: z.union([z.string(), z.number()]), last_shown_date: z.union([z.string(), z.number()]).optional() }),
        advertiser: z.object({ business_id: z.union([z.string(), z.number()]) }),
      }),
    ),
    has_more: z.boolean().optional(),
    search_id: z.string().optional(),
  }),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

/** TikTok dates are YYYYMMDD. */
const toIso = (v: string | number): string => {
  const s = String(v);
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s.slice(0, 10);
};
const toCompact = (iso: string): string => iso.replaceAll("-", "");

export class TikTokCommercialContentProvider implements AdLibraryProvider {
  readonly meta = tiktokCommercialMeta;
  readonly platform = "tiktok" as const;
  private token?: { value: string; expiresAt: number };

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
    if (!isCovered(this.meta, query.country)) return fail("unsupported_country", "TikTok Commercial Content : UE uniquement.");
    if (this.status().state !== "ready") return fail("not_configured", "TikTok Commercial Content non configuré.");

    const token = await this.getToken();
    if (!token.ok) return token;

    const today = new Date().toISOString().slice(0, 10);
    const ads: RawAd[] = [];
    let searchId: string | undefined;
    let hasMore = true;
    for (let page = 0; hasMore && page < MAX_PAGES; page += 1) {
      const body = {
        filters: { ad_published_date_range: { min: toCompact(query.since), max: toCompact(today) }, country_code: query.country },
        search_term: query.terms[0] ?? "",
        max_count: PAGE_SIZE,
        ...(searchId ? { search_id: searchId } : {}),
      };
      const raw = await httpJson(
        `${API}/research/adlib/ad/query/?fields=ad.id,ad.first_shown_date,ad.last_shown_date,advertiser.business_id`,
        `TikTok adlib query (${query.country})`,
        { timeoutMs: this.timeoutMs, method: "POST", headers: { Authorization: `Bearer ${token.data}`, "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if (!raw.ok) return raw;
      const parsed = querySchema.safeParse(raw.data);
      if (!parsed.success) return fail("invalid_response", "TikTok adlib: unexpected response shape");
      if (parsed.data.error && parsed.data.error.code !== "ok") return fail("upstream_error", `TikTok adlib: ${parsed.data.error.code}`);
      ads.push(
        ...parsed.data.data.ads.map((a) => ({
          id: String(a.ad.id),
          advertiserId: String(a.advertiser.business_id),
          startDate: toIso(a.ad.first_shown_date),
          stopDate: a.ad.last_shown_date ? toIso(a.ad.last_shown_date) : undefined,
        })),
      );
      hasMore = parsed.data.data.has_more ?? false;
      searchId = parsed.data.data.search_id;
    }

    const source: SourceRef = {
      sourceId: this.meta.id,
      origin: "live",
      collectedAt: new Date().toISOString(),
      connectorVersion: this.meta.connectorVersion,
      queryRef: `research/adlib/ad/query/${query.country}/${query.terms[0] ?? ""}`,
      sourceUrl: "https://library.tiktok.com/ads",
      period: { start: query.since, end: today },
    };
    return ok({ ...aggregateAds(ads, today, query.since), truncated: hasMore, source });
  }

  private async getToken(): Promise<ProviderResult<string>> {
    if (this.token && this.token.expiresAt > Date.now()) return ok(this.token.value);
    const raw = await httpJson(`${API}/oauth/token/`, "TikTok client token", {
      timeoutMs: this.timeoutMs,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: this.env.TIKTOK_CLIENT_KEY ?? "",
        client_secret: this.env.TIKTOK_CLIENT_SECRET ?? "",
        grant_type: "client_credentials",
      }).toString(),
      attempts: 1,
    });
    if (!raw.ok) return raw;
    const parsed = tokenSchema.safeParse(raw.data);
    if (!parsed.success) return fail("invalid_response", "TikTok OAuth: missing access_token");
    this.token = { value: parsed.data.access_token, expiresAt: Date.now() + ((parsed.data.expires_in ?? 3600) - 120) * 1000 };
    return ok(parsed.data.access_token);
  }
}
