import "server-only";
import type { BrandResult, StoreBrand } from "@/domain/store";
import { STOREFRONT_API_VERSION } from "@/server/web/shop-storefront";
import { postPublicJson, DEFAULT_FETCH_DEPS, type FetchDeps } from "@/server/web/safe-fetch";

/**
 * The store's brand (logo, colours, slogan) as its public Storefront API gives it, without a token.
 * Only https images and #rrggbb colours are kept: they end up in the page's style and markup.
 * Kept one hour.
 */

const QUERY = `{ shop { brand { slogan logo { image { url } } squareLogo { image { url } } colors { primary { background } secondary { background } } } } }`;
const CACHE_MS = 60 * 60 * 1000;
const HEX = /^#[0-9a-f]{6}$/i;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const first = (v: unknown): Json | null => (Array.isArray(v) ? obj(v[0]) : null);
const https = (v: unknown): string | null => (typeof v === "string" && /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : null);
const hex = (v: unknown): string | null => (typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : null);

export function parseBrand(body: string): StoreBrand | null {
  let doc: Json | null;
  try {
    doc = obj(JSON.parse(body));
  } catch {
    return null;
  }
  const brand = obj(obj(obj(doc?.data)?.shop)?.brand);
  if (!brand) return obj(obj(doc?.data)?.shop) ? { slogan: null, logo: null, squareLogo: null, primary: null, secondary: null } : null;
  const colors = obj(brand.colors);
  const slogan = typeof brand.slogan === "string" && brand.slogan.trim() ? brand.slogan.trim().slice(0, 140) : null;
  return {
    slogan,
    logo: https(obj(obj(brand.logo)?.image)?.url),
    squareLogo: https(obj(obj(brand.squareLogo)?.image)?.url),
    primary: hex(first(colors?.primary)?.background),
    secondary: hex(first(colors?.secondary)?.background),
  };
}

const kept = new Map<string, { until: number; result: BrandResult }>();

export async function readBrand(origin: string | null, deps: FetchDeps = DEFAULT_FETCH_DEPS, now: number = Date.now()): Promise<BrandResult> {
  if (!origin) return { ok: false, code: "no_public_store" };
  const known = kept.get(origin);
  if (known && known.until > now) return known.result;
  const answer = await postPublicJson(`${origin}/api/${STOREFRONT_API_VERSION}/graphql.json`, { query: QUERY }, deps);
  const brand = answer.ok ? parseBrand(answer.body) : null;
  const result: BrandResult = brand ? { ok: true, brand } : { ok: false, code: answer.ok ? "no_public_store" : "unreachable" };
  kept.set(origin, { until: now + CACHE_MS, result });
  return result;
}
