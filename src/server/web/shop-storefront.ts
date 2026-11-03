import type { ShopStorefront } from "@/domain/competitor";
import { postPublicJson, type FetchDeps } from "./safe-fetch";

/**
 * A Shopify shop through its official Storefront API, tokenless (no key, no account), as Shopify
 * documents it: products, collections and search are open; tags, metafields, menus and customers are
 * not. Queries stay well under the tokenless complexity limit of 1,000.
 * https://shopify.dev/docs/api/storefront (version 2026-10)
 *
 * What it adds to /products.json: the shop's own best-selling order (`sortKey: BEST_SELLING`, which
 * robots.txt forbids through the collection pages' `sort_by`), the currencies and languages it sells
 * in, and the price it really asks in each country (`@inContext(country)`), in that country's currency.
 * Everything is an observation of the public offer on the day: never a sale, never a stock level.
 */

export const STOREFRONT_API_VERSION = "2026-10";
/** Countries whose price is asked, at most: one request each, paced like the other reads of the shop. */
const MAX_COUNTRIES = 5;
const PREFERRED = ["FR", "DE", "GB", "US", "CH", "ES", "IT", "BE", "NL", "CA", "AU"] as const;

const SHOP_QUERY = `{
  shop { paymentSettings { currencyCode enabledPresentmentCurrencies } }
  localization { availableLanguages { isoCode } availableCountries { isoCode } }
  products(first: 10, sortKey: BEST_SELLING) { nodes { title handle availableForSale priceRange { minVariantPrice { amount currencyCode } } } }
}`;

const PRICE_QUERY = `query ($country: CountryCode!, $handle: String!) @inContext(country: $country) {
  product(handle: $handle) {
    availableForSale
    priceRange { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
    compareAtPriceRange { maxVariantPrice { amount currencyCode } }
  }
}`;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const money = (v: unknown): { amount: number; currency: string } | null => {
  const m = obj(v);
  const amount = Number(m?.amount);
  const currency = str(m?.currencyCode);
  return currency && Number.isFinite(amount) ? { amount, currency } : null;
};

/** The shop part of the answer; null when it is not a Storefront answer (an error, or not Shopify). */
export function parseStorefrontShop(body: string): Omit<ShopStorefront, "prices" | "apiVersion"> | null {
  let doc: Json | null;
  try {
    doc = obj(JSON.parse(body));
  } catch {
    return null;
  }
  const data = obj(doc?.data);
  const payment = obj(obj(data?.shop)?.paymentSettings);
  if (!data || !payment) return null;
  const localization = obj(data.localization);
  const codes = (list: unknown) => arr(list).flatMap((x) => (str(obj(x)?.isoCode) ? [str(obj(x)?.isoCode) as string] : []));
  return {
    baseCurrency: str(payment.currencyCode),
    currencies: arr(payment.enabledPresentmentCurrencies).flatMap((c) => (str(c) ? [c as string] : [])),
    languages: codes(localization?.availableLanguages),
    countries: codes(localization?.availableCountries),
    bestSellers: arr(obj(data.products)?.nodes).flatMap((n) => {
      const node = obj(n);
      const title = str(node?.title);
      const handle = str(node?.handle);
      const price = money(obj(node?.priceRange)?.minVariantPrice);
      return title && handle ? [{ title, handle, available: node?.availableForSale === true, priceMin: price?.amount ?? null, currency: price?.currency ?? null }] : [];
    }),
  };
}

/** One country's price of the product; null when the product is not sold there or the answer is off. */
export function parseStorefrontPrice(body: string, country: string): ShopStorefront["prices"][number] | null {
  let doc: Json | null;
  try {
    doc = obj(JSON.parse(body));
  } catch {
    return null;
  }
  const product = obj(obj(doc?.data)?.product);
  const min = money(obj(product?.priceRange)?.minVariantPrice);
  const max = money(obj(product?.priceRange)?.maxVariantPrice);
  if (!product || !min || !max) return null;
  const compare = money(obj(product.compareAtPriceRange)?.maxVariantPrice);
  return { country, currency: min.currency, min: min.amount, max: max.amount, compareAtMax: compare && compare.amount > 0 ? compare.amount : null, available: product.availableForSale === true };
}

/** The countries to price: the shop's own, the usual markets first. */
export function countriesToPrice(available: readonly string[]): string[] {
  const set = new Set(available);
  return [...PREFERRED.filter((c) => set.has(c)), ...available.filter((c) => !(PREFERRED as readonly string[]).includes(c))].slice(0, MAX_COUNTRIES);
}

export async function readStorefront(origin: string, handle: string | null, deps: FetchDeps, sleep: (ms: number) => Promise<void>, paceMs: number): Promise<ShopStorefront | null> {
  const endpoint = `${origin}/api/${STOREFRONT_API_VERSION}/graphql.json`;
  const answer = await postPublicJson(endpoint, { query: SHOP_QUERY }, deps);
  const shop = answer.ok ? parseStorefrontShop(answer.body) : null;
  if (!shop) return null;
  const prices: ShopStorefront["prices"][number][] = [];
  if (handle) {
    for (const country of countriesToPrice(shop.countries)) {
      await sleep(paceMs);
      const priced = await postPublicJson(endpoint, { query: PRICE_QUERY, variables: { country, handle } }, deps);
      const price = priced.ok ? parseStorefrontPrice(priced.body, country) : null;
      if (price) prices.push(price);
    }
  }
  return { apiVersion: STOREFRONT_API_VERSION, ...shop, prices };
}
