import { z } from "zod";
import { missingEnv, type ServerEnv } from "@/config/env";
import type { SourceRef } from "@/domain/provenance";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import {
  fail,
  ok,
  type ConnectionCheckStep,
  type ConnectionTestable,
  type ContentObservation,
  type ContentProvider,
  type ContentQuery,
  type ProviderMeta,
  type ProviderResult,
  type ProviderStatus,
} from "../contracts";
import type { ErrorDescription } from "../http";
import { cacheKey, cached, httpJson } from "../http";

/**
 * YouTube Data API v3 — videos about the product per country (regionCode + relevanceLanguage).
 * search.list costs 100 quota units, videos.list 1 unit; the free daily quota is 10 000 units.
 * Written from the official reference; NOT yet run with real credentials.
 * TODO(youtube): run with a real key, then mark "live_verified".
 */

const API = "https://www.googleapis.com/youtube/v3";
const CACHE_TTL_SECONDS = 24 * 3600;
const SAMPLE = 25;
const REQUIRED_ENV = ["YOUTUBE_API_KEY"] as const satisfies ReadonlyArray<keyof ServerEnv>;

export const youtubeMeta: ProviderMeta = {
  id: "youtube-data",
  name: "YouTube Data API",
  category: "content",
  authMode: "api_key",
  access: "account",
  docsUrl: "https://developers.google.com/youtube/v3/docs/search/list",
  qualityTier: 0.5,
  connectorVersion: "0.1.0",
  requiredEnv: [...REQUIRED_ENV],
  coverage: { kind: "all" },
  verification: "documented_unverified",
  notes: [
    "Vidéos publiées sur le produit dans chaque pays sur 12 mois, et vues médianes des plus pertinentes : intérêt et contenus concurrents.",
    "Quota gratuit de 10 000 unités par jour, soit une dizaine d'analyses de 9 pays.",
  ],
};

/** Google API errors: { error: { status, errors: [{ reason }], details: [{ reason }] } } → reason only. */
export function describeGoogleApiError(_status: number, body: string): ErrorDescription | undefined {
  try {
    const error = (JSON.parse(body) as { error?: { status?: unknown; errors?: Array<{ reason?: unknown }>; details?: Array<{ reason?: unknown }> } }).error;
    const reason = error?.details?.find((d) => typeof d.reason === "string")?.reason ?? error?.errors?.find((e) => typeof e.reason === "string")?.reason ?? error?.status;
    return typeof reason === "string" ? { reason, ...(/quota|rateLimit/i.test(reason) ? { code: "rate_limited" as const } : {}) } : undefined;
  } catch {
    return undefined;
  }
}

export const YOUTUBE_ERROR_HINTS: Readonly<Record<string, string>> = {
  API_KEY_INVALID: "Clé refusée par Google : vérifie qu'elle a été copiée en entier.",
  keyInvalid: "Clé refusée par Google : vérifie qu'elle a été copiée en entier.",
  SERVICE_DISABLED: "La YouTube Data API v3 n'est pas activée dans le projet Google Cloud de cette clé.",
  accessNotConfigured: "La YouTube Data API v3 n'est pas activée dans le projet Google Cloud de cette clé.",
  API_KEY_SERVICE_BLOCKED: "Cette clé est restreinte à d'autres API : ajoute la YouTube Data API v3 dans ses restrictions.",
  quotaExceeded: "Quota du jour épuisé (10 000 unités) : il se recharge à minuit, heure du Pacifique.",
  forbidden: "Accès refusé par Google pour cette clé.",
};

const searchSchema = z.object({
  pageInfo: z.object({ totalResults: z.number() }),
  items: z.array(z.object({ id: z.object({ videoId: z.string().optional() }), snippet: z.object({ publishedAt: z.string() }).optional() })),
});
const videosSchema = z.object({ items: z.array(z.object({ id: z.string(), statistics: z.object({ viewCount: z.string().optional() }).optional() })) });

export class YouTubeProvider implements ContentProvider, ConnectionTestable {
  readonly meta = youtubeMeta;

  constructor(
    private readonly env: ServerEnv,
    private readonly cache: ProviderCacheRepository,
    private readonly timeoutMs: number,
  ) {}

  status(): ProviderStatus {
    const missing = missingEnv(this.env, REQUIRED_ENV);
    if (missing.length > 0) return { state: "not_configured", detail: `Variables manquantes : ${missing.join(", ")}` };
    return { state: "ready", detail: "Configuré — connecteur écrit depuis la doc, jamais vérifié en réel." };
  }

  /** The key travels in the query string: it is never part of labels, cache keys or source references. */
  private call(path: string, params: Record<string, string>, label: string, fresh: boolean): Promise<ProviderResult<unknown>> {
    const query = new URLSearchParams(params).toString();
    const keyless = `${API}${path}?${query}`;
    const load = () =>
      httpJson(`${keyless}&key=${encodeURIComponent(this.env.YOUTUBE_API_KEY ?? "")}`, label, {
        timeoutMs: this.timeoutMs,
        attempts: 1,
        describeError: describeGoogleApiError,
      });
    return fresh ? load() : cached(this.cache, cacheKey(this.meta.id, keyless), this.meta.id, CACHE_TTL_SECONDS, load);
  }

  getContent(query: ContentQuery): Promise<ProviderResult<ContentObservation>> {
    return this.fetchContent(query, false);
  }

  /** `fresh` skips the cache: a connection test must really reach Google with the current key. */
  private async fetchContent(query: ContentQuery, fresh: boolean): Promise<ProviderResult<ContentObservation>> {
    if (this.status().state !== "ready") return fail("not_configured", "YouTube Data API non configurée.");
    const term = query.terms[0];
    if (!term) return fail("no_data", "YouTube : aucun terme");

    const search = await this.call(
      "/search",
      {
        part: "snippet",
        type: "video",
        q: term,
        regionCode: query.country,
        relevanceLanguage: query.language,
        publishedAfter: query.publishedAfter,
        maxResults: String(SAMPLE),
      },
      "YouTube search",
      fresh,
    );
    if (!search.ok) return search;
    const parsed = searchSchema.safeParse(search.data);
    if (!parsed.success) return fail("invalid_response", "YouTube search: unexpected response shape");
    const hits = parsed.data.items.flatMap((i) => (i.id.videoId ? [{ id: i.id.videoId, publishedAt: i.snippet?.publishedAt ?? "" }] : []));

    let views = new Map<string, number>();
    if (hits.length > 0) {
      const stats = await this.call("/videos", { part: "statistics", id: hits.map((h) => h.id).join(",") }, "YouTube videos", fresh);
      const parsedStats = stats.ok ? videosSchema.safeParse(stats.data) : null;
      if (parsedStats?.success) {
        views = new Map(parsedStats.data.items.flatMap((v) => (v.statistics?.viewCount ? [[v.id, Number(v.statistics.viewCount)] as const] : [])));
      }
    }

    const source: SourceRef = {
      sourceId: this.meta.id,
      origin: "live",
      collectedAt: new Date().toISOString(),
      connectorVersion: this.meta.connectorVersion,
      queryRef: `search/${query.country}/${query.language}/${term}`,
      sourceUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(term)}`,
      period: { start: query.publishedAfter.slice(0, 10), end: new Date().toISOString().slice(0, 10) },
    };
    return ok({
      totalResults: parsed.data.pageInfo.totalResults,
      videos: hits.map((h) => ({ ...h, views: views.get(h.id) ?? null })),
      source,
    });
  }

  async diagnose(now: Date): Promise<ConnectionCheckStep[]> {
    const label = "Recherche de vidéos (France)";
    if (this.status().state !== "ready") return [{ id: "search", label, status: "skipped", detail: "Clé API manquante." }];
    const result = await this.fetchContent(
      {
        terms: ["chaussettes"],
        country: "FR",
        language: "fr",
        publishedAfter: new Date(now.getTime() - 365 * 86_400_000).toISOString(),
      },
      true,
    );
    if (!result.ok) {
      const reason = /\(([A-Za-z_]+)\)$/.exec(result.error.message)?.[1];
      return [{ id: "search", label, status: "error", detail: (reason && YOUTUBE_ERROR_HINTS[reason]) ?? `Erreur renvoyée : ${result.error.message}`, ...(reason ? { items: [`Code Google : ${reason}`] } : {}) }];
    }
    return [{ id: "search", label, status: "ok", detail: `Réponse reçue : environ ${result.data.totalResults.toLocaleString("fr-FR")} vidéos sur 12 mois pour « chaussettes ».` }];
  }
}
