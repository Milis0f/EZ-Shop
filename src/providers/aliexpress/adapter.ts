import { createHmac } from "node:crypto";
import { missingEnv, type ServerEnv } from "@/config/env";
import type { SourceRef } from "@/domain/provenance";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import {
  fail,
  ok,
  type ConnectionCheckStep,
  type ConnectionTestable,
  type ProviderMeta,
  type ProviderResult,
  type ProviderStatus,
  type SourcingObservation,
  type SourcingProvider,
  type SourcingQuery,
} from "../contracts";
import { cacheKey, cached, httpJson } from "../http";

/**
 * AliExpress Open Platform — aliexpress.affiliate.product.query (Affiliate API).
 * Business interface called through /sync, signed with HMAC-SHA256 over the sorted parameters
 * (the signature function reproduces both official test vectors, see adapter test).
 * Written from the official documentation (2026-10-15); NOT yet run with real credentials.
 * TODO(aliexpress): run with a real app key, then mark "live_verified".
 */

const ENDPOINT = "https://api-sg.aliexpress.com/sync";
const METHOD = "aliexpress.affiliate.product.query";
const CACHE_TTL_SECONDS = 24 * 3600;
const PAGE_SIZE = 50;
const REQUIRED_ENV = ["ALIEXPRESS_APP_KEY", "ALIEXPRESS_APP_SECRET"] as const satisfies ReadonlyArray<keyof ServerEnv>;

export const aliexpressMeta: ProviderMeta = {
  id: "aliexpress-affiliate",
  name: "AliExpress Affiliate API",
  category: "sourcing",
  authMode: "api_key",
  access: "approval",
  docsUrl: "https://openservice.aliexpress.com/doc/api.htm#/api?cid=21407&path=aliexpress.affiliate.product.query&methodType=GET/POST",
  qualityTier: 0.7,
  connectorVersion: "0.1.0",
  requiredEnv: [...REQUIRED_ENV],
  coverage: { kind: "all" },
  verification: "documented_unverified",
  notes: [
    "Prix d'achat réels du produit sur AliExpress, nombre de ventes récentes et notes des vendeurs : ton coût de sourcing.",
    "Compte affilié gratuit et application validée par AliExpress (1 à 3 jours ouvrés).",
  ],
};

/** HMAC-SHA256 of the parameters sorted by name, concatenated as name+value, upper-case hex. */
export function signAliExpress(params: Readonly<Record<string, string>>, secret: string, apiPath = ""): string {
  const base = Object.keys(params)
    .filter((k) => k !== "sign" && params[k] !== "")
    .toSorted()
    .map((k) => `${k}${params[k]}`)
    .join("");
  return createHmac("sha256", secret).update(apiPath + base, "utf8").digest("hex").toUpperCase();
}

export const ALIEXPRESS_ERROR_HINTS: Readonly<Record<string, string>> = {
  InvalidAppKey: "App Key inconnue : vérifie qu'elle vient de l'application validée dans la console AliExpress.",
  IncompleteSignature: "Signature refusée : l'App Secret ne correspond pas à l'App Key.",
  InvalidSignature: "Signature refusée : l'App Secret ne correspond pas à l'App Key.",
  AppWhiteIpLimit: "L'application limite les adresses IP autorisées : ajoute la tienne dans la console AliExpress.",
  InsufficientPermission: "L'application n'a pas accès aux API Affiliate : vérifie sa catégorie et sa validation.",
  ApiCallLimit: "Limite d'appels atteinte : réessaie plus tard.",
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

/** Accepts both the documented "streamlined" shape and the wrapped *_response shape; reports API errors by code. */
export function parseAliExpress(payload: unknown): ProviderResult<{ total: number; products: SourcingObservation["products"] }> {
  const root = (payload ?? {}) as Record<string, unknown>;
  const errorResponse = root.error_response as { code?: unknown } | undefined;
  if (errorResponse) {
    const code = typeof errorResponse.code === "string" && /^[A-Za-z][\w.]{1,63}$/.test(errorResponse.code) ? errorResponse.code : "error";
    return fail("unauthorized", `AliExpress: HTTP 200 (${code})`);
  }
  const wrapped = (root.aliexpress_affiliate_product_query_response as Record<string, unknown> | undefined) ?? root;
  const resp = wrapped.resp_result as { resp_code?: unknown; result?: Record<string, unknown> } | undefined;
  if (!resp) return fail("invalid_response", "AliExpress: unexpected response shape");
  if (resp.resp_code !== undefined && Number(resp.resp_code) !== 200) {
    return fail(Number(resp.resp_code) === 405 ? "no_data" : "upstream_error", `AliExpress: resp_code ${String(resp.resp_code)}`);
  }
  const result = resp.result ?? {};
  const rawProducts = Array.isArray(result.products)
    ? result.products
    : Array.isArray((result.products as { product?: unknown } | undefined)?.product)
      ? ((result.products as { product: unknown[] }).product)
      : [];
  const products = rawProducts.flatMap((p) => {
    const o = p as Record<string, unknown>;
    const price = num(o.target_sale_price ?? o.sale_price);
    if (price === null || price <= 0) return [];
    return [
      {
        title: String(o.product_title ?? ""),
        price,
        currency: String(o.target_sale_price_currency ?? o.sale_price_currency ?? "EUR"),
        orders: num(o.lastest_volume),
        rating: num(o.evaluate_rate),
        url: String(o.product_detail_url ?? ""),
      },
    ];
  });
  return ok({ total: num(result.total_record_count) ?? products.length, products });
}

export class AliExpressProvider implements SourcingProvider, ConnectionTestable {
  readonly meta = aliexpressMeta;

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

  searchProducts(query: SourcingQuery): Promise<ProviderResult<SourcingObservation>> {
    return this.fetchProducts(query, false);
  }

  private async fetchProducts(query: SourcingQuery, fresh: boolean): Promise<ProviderResult<SourcingObservation>> {
    if (this.status().state !== "ready") return fail("not_configured", "AliExpress Affiliate API non configurée.");
    const keywords = query.terms[0];
    if (!keywords) return fail("no_data", "AliExpress : aucun terme");

    const business: Record<string, string> = {
      keywords,
      target_currency: "EUR",
      target_language: "EN",
      ship_to_country: query.shipTo,
      page_size: String(PAGE_SIZE),
      sort: "LAST_VOLUME_DESC",
      ...(this.env.ALIEXPRESS_TRACKING_ID ? { tracking_id: this.env.ALIEXPRESS_TRACKING_ID } : {}),
    };
    // Cache on the business query only: the timestamp and signature change on every call.
    const key = cacheKey(this.meta.id, JSON.stringify(business));
    const load = () => {
      const params: Record<string, string> = {
        method: METHOD,
        app_key: this.env.ALIEXPRESS_APP_KEY ?? "",
        timestamp: String(Date.now()),
        sign_method: "sha256",
        ...business,
      };
      const signed = { ...params, sign: signAliExpress(params, this.env.ALIEXPRESS_APP_SECRET ?? "") };
      return httpJson(ENDPOINT, "AliExpress product query", {
        timeoutMs: this.timeoutMs,
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
        body: new URLSearchParams(signed).toString(),
        attempts: 1,
      });
    };
    const raw = fresh ? await load() : await cached(this.cache, key, this.meta.id, CACHE_TTL_SECONDS, load, (payload) => parseAliExpress(payload).ok);
    if (!raw.ok) return raw;
    const parsed = parseAliExpress(raw.data);
    if (!parsed.ok) return parsed;

    const source: SourceRef = {
      sourceId: this.meta.id,
      origin: "live",
      collectedAt: new Date().toISOString(),
      connectorVersion: this.meta.connectorVersion,
      queryRef: `${METHOD}/${query.shipTo}/${keywords}`,
      sourceUrl: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(keywords)}`,
    };
    return ok({ totalProducts: parsed.data.total, products: parsed.data.products, source });
  }

  async diagnose(): Promise<ConnectionCheckStep[]> {
    const label = "Recherche de produits";
    if (this.status().state !== "ready") return [{ id: "query", label, status: "skipped", detail: "App Key ou App Secret manquant." }];
    const result = await this.fetchProducts({ terms: ["socks"], shipTo: "FR" }, true);
    if (!result.ok) {
      const reason = /\(([A-Za-z][\w.]*)\)$/.exec(result.error.message)?.[1];
      return [{ id: "query", label, status: "error", detail: (reason && ALIEXPRESS_ERROR_HINTS[reason]) ?? `Erreur renvoyée : ${result.error.message}`, ...(reason ? { items: [`Code AliExpress : ${reason}`] } : {}) }];
    }
    const tracking = this.env.ALIEXPRESS_TRACKING_ID ? "" : " Sans Tracking ID, certaines applications ne reçoivent aucun produit.";
    return [
      {
        id: "query",
        label,
        status: result.data.products.length > 0 ? "ok" : "error",
        detail:
          result.data.products.length > 0
            ? `Réponse reçue : ${result.data.totalProducts.toLocaleString("fr-FR")} produits pour « socks ».`
            : `Réponse vide pour « socks ».${tracking}`,
      },
    ];
  }
}
