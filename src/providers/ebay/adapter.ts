import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { formatInt } from "@/i18n/format";
import { t } from "@/i18n/translate";
import { checkMessages, errorDetail } from "../check-messages";
import { missingEnv, type ServerEnv } from "@/config/env";
import type { CountryCode } from "@/domain/country";
import type { SourceRef } from "@/domain/provenance";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import {
  fail,
  ok,
  type ConnectionCheckStep,
  type ConnectionTestable,
  type CountryTermsQuery,
  type ListingsObservation,
  type MarketplaceProvider,
  type ProviderMeta,
  type ProviderResult,
  type ProviderStatus,
} from "../contracts";
import type { ErrorDescription } from "../http";
import { cacheKey, cached, httpJson } from "../http";
import { sharedResult, type SharedResult } from "../shared-result";

/**
 * eBay Browse API — listings matching the product on each national eBay site.
 * Application token (client credentials grant, scope api_scope), then item_summary/search with the
 * X-EBAY-C-MARKETPLACE-ID header. Contract checked against eBay's OpenAPI spec on 2026-10-15
 * (limit ≤ 200, total, itemSummaries[].price, filter itemLocationCountry). NOT yet run with real keys.
 * TODO(ebay): run with a production keyset, then mark "live_verified".
 */

const API = "https://api.ebay.com";
const SCOPE = "https://api.ebay.com/oauth/api_scope";
const CACHE_TTL_SECONDS = 24 * 3600;
const SAMPLE = 50;
const REQUIRED_ENV = ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"] as const satisfies ReadonlyArray<keyof ServerEnv>;

/** National eBay sites only: a country without one is reported as such, never served another site's data. */
export const EBAY_MARKETPLACES: Partial<Record<CountryCode, string>> = {
  FR: "EBAY_FR",
  BE: "EBAY_BE",
  CH: "EBAY_CH",
  DE: "EBAY_DE",
  AT: "EBAY_AT",
  NL: "EBAY_NL",
  ES: "EBAY_ES",
  IT: "EBAY_IT",
  IE: "EBAY_IE",
  PL: "EBAY_PL",
  GB: "EBAY_GB",
  US: "EBAY_US",
  CA: "EBAY_CA",
  AU: "EBAY_AU",
};

export const ebayMeta: ProviderMeta = {
  id: "ebay-browse",
  name: "eBay Browse API",
  category: "marketplace",
  authMode: "oauth",
  access: "account",
  docsUrl: "https://developer.ebay.com/develop/api/buy/browse_api/item_summary/search",
  qualityTier: 0.7,
  connectorVersion: "0.1.0",
  requiredEnv: [...REQUIRED_ENV],
  coverage: {
    kind: "list",
    countries: Object.keys(EBAY_MARKETPLACES) as CountryCode[],
    note: "Pays avec un site eBay national (pas le Luxembourg, le Portugal, la Suède ni le Danemark).",
  },
  verification: "documented_unverified",
  notes: [
    "Annonces et prix réels du produit sur le site eBay de chaque pays, et part des vendeurs basés en Chine.",
    "Compte développeur gratuit ; données publiques d'annonces, aucune vente lue.",
  ],
};

/** eBay errors: OAuth { error } or REST { errors: [{ errorId }] } → a short code. */
export function describeEbayError(_status: number, body: string): ErrorDescription | undefined {
  try {
    const json = JSON.parse(body) as { error?: unknown; errors?: Array<{ errorId?: unknown }> };
    if (typeof json.error === "string") return { reason: json.error, ...(json.error === "invalid_client" ? { code: "unauthorized" as const } : {}) };
    const id = json.errors?.[0]?.errorId;
    return typeof id === "number" ? { reason: `ebay_${id}` } : undefined;
  } catch {
    return undefined;
  }
}

const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().optional() });
/** The token with how long to keep it, derived from the `expires_in` the identity service returned. */
interface ApplicationToken {
  readonly token: string;
  readonly ttlMs: number;
}
const searchSchema = z.object({
  total: z.number().optional(),
  itemSummaries: z
    .array(z.object({ price: z.object({ value: z.string(), currency: z.string() }).optional(), itemLocation: z.object({ country: z.string().optional() }).optional() }))
    .optional(),
});

/**
 * The answer is a Browse search result. Every member of `searchSchema` is optional, so `{}` or an
 * `{ errors: [...] }` body would parse: the shape must also carry `total` or `itemSummaries`, and no
 * top-level `errors`. A search without listings (`{ total: 0 }`) is a stable answer and stays cacheable.
 */
export function isEbaySearch(payload: unknown): boolean {
  const parsed = searchSchema.safeParse(payload);
  if (!parsed.success || typeof payload !== "object" || payload === null || "errors" in payload) return false;
  return parsed.data.total !== undefined || parsed.data.itemSummaries !== undefined;
}

export class EbayBrowseProvider implements MarketplaceProvider, ConnectionTestable {
  readonly meta = ebayMeta;
  /** Countries run in parallel on this instance: they share one token request. */
  private readonly applicationToken: SharedResult<ApplicationToken> = sharedResult(() => this.loadToken(), { ttlMs: (value) => value.ttlMs });

  constructor(
    private readonly env: ServerEnv,
    private readonly cache: ProviderCacheRepository,
    private readonly timeoutMs: number,
  ) {}

  status(): ProviderStatus {
    const missing = missingEnv(this.env, REQUIRED_ENV);
    if (missing.length > 0) return { state: "not_configured", detail: `Variables manquantes : ${missing.join(", ")}` };
    return { state: "ready", detail: "Configuré — connecteur écrit depuis la spécification eBay, jamais vérifié en réel." };
  }

  private async getToken(): Promise<ProviderResult<string>> {
    const application = await this.applicationToken.get();
    return application.ok ? ok(application.data.token) : application;
  }

  private async loadToken(): Promise<ProviderResult<ApplicationToken>> {
    const basic = Buffer.from(`${this.env.EBAY_CLIENT_ID ?? ""}:${this.env.EBAY_CLIENT_SECRET ?? ""}`).toString("base64");
    const raw = await httpJson(`${API}/identity/v1/oauth2/token`, "eBay OAuth token", {
      timeoutMs: this.timeoutMs,
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE }).toString(),
      attempts: 1,
      describeError: describeEbayError,
    });
    if (!raw.ok) return raw;
    const parsed = tokenSchema.safeParse(raw.data);
    if (!parsed.success) return fail("invalid_response", "eBay OAuth: missing access_token");
    return ok({ token: parsed.data.access_token, ttlMs: Math.max(60, (parsed.data.expires_in ?? 7200) - 300) * 1000 });
  }

  private async search(marketplaceId: string, params: Record<string, string>, fresh: boolean): Promise<ProviderResult<z.infer<typeof searchSchema>>> {
    const url = `${API}/buy/browse/v1/item_summary/search?${new URLSearchParams(params).toString()}`;
    const load = async (): Promise<ProviderResult<unknown>> => {
      const token = await this.getToken();
      if (!token.ok) return token;
      return httpJson(url, `eBay search ${marketplaceId}`, {
        timeoutMs: this.timeoutMs,
        headers: { Authorization: `Bearer ${token.data}`, "X-EBAY-C-MARKETPLACE-ID": marketplaceId },
        describeError: describeEbayError,
      });
    };
    const raw = fresh
      ? await load()
      : await cached(
          this.cache,
          cacheKey(this.meta.id, `${marketplaceId}|${url}`),
          this.meta.id,
          CACHE_TTL_SECONDS,
          load,
          isEbaySearch,
        );
    if (!raw.ok) return raw;
    // `isEbaySearch` also refuses `{}` and `{ errors: [...] }`, which `searchSchema` alone would accept as an invented total of 0.
    const parsed = searchSchema.safeParse(raw.data);
    return parsed.success && isEbaySearch(raw.data) ? ok(parsed.data) : fail("invalid_response", "eBay search: unexpected response shape");
  }

  getListings(query: CountryTermsQuery): Promise<ProviderResult<ListingsObservation>> {
    return this.fetchListings(query, false);
  }

  private async fetchListings(query: CountryTermsQuery, fresh: boolean): Promise<ProviderResult<ListingsObservation>> {
    if (this.status().state !== "ready") return fail("not_configured", "eBay Browse API non configurée.");
    const marketplaceId = EBAY_MARKETPLACES[query.country];
    if (!marketplaceId) return fail("unsupported_country", `eBay : pas de site national pour ${query.country}`);
    const term = query.terms[0];
    if (!term) return fail("no_data", "eBay : aucun terme");

    const listings = await this.search(marketplaceId, { q: term, limit: String(SAMPLE) }, fresh);
    if (!listings.ok) return listings;
    const china = await this.search(marketplaceId, { q: term, limit: "1", filter: "itemLocationCountry:CN" }, fresh);

    const source: SourceRef = {
      sourceId: this.meta.id,
      origin: "live",
      collectedAt: new Date().toISOString(),
      connectorVersion: this.meta.connectorVersion,
      queryRef: `browse/${marketplaceId}/${term}`,
      period: { start: new Date().toISOString().slice(0, 10), end: new Date().toISOString().slice(0, 10) },
    };
    return ok({
      marketplaceId,
      total: listings.data.total ?? 0,
      prices: (listings.data.itemSummaries ?? []).flatMap((i) => {
        const value = Number(i.price?.value);
        return i.price && Number.isFinite(value) && value > 0 ? [{ value, currency: i.price.currency }] : [];
      }),
      chinaTotal: china.ok ? (china.data.total ?? 0) : null,
      source,
    });
  }

  async diagnose(_now: Date, locale: Locale): Promise<ConnectionCheckStep[]> {
    const m = checkMessages(locale);
    const steps: ConnectionCheckStep[] = [];
    if (this.status().state !== "ready") return [{ id: "token", label: m.ebay.token, status: "skipped", detail: m.ebay.missing }];
    this.applicationToken.reset();
    const token = await this.getToken();
    const hint = (message: string) => errorDetail(locale, m.hints.ebay, "eBay", message, /\(([A-Za-z0-9_]+)\)$/.exec(message)?.[1]);
    if (!token.ok) {
      return [
        { id: "token", label: m.ebay.token, status: "error", ...hint(token.error.message) },
        { id: "search", label: m.ebay.search, status: "skipped", detail: m.notTested },
      ];
    }
    steps.push({ id: "token", label: m.ebay.token, status: "ok", detail: m.ebay.tokenOk });
    const result = await this.fetchListings({ terms: ["chaussettes"], country: "FR", language: "fr" }, true);
    steps.push(
      result.ok
        ? { id: "search", label: m.ebay.search, status: "ok", detail: t(m.ebay.ok, { count: formatInt(result.data.total, locale) }) }
        : { id: "search", label: m.ebay.search, status: "error", ...hint(result.error.message) },
    );
    return steps;
  }
}
