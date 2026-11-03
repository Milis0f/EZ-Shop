import "server-only";
import type { ServerEnv } from "@/config/env";
import type { StoreFailure, StoreOrder, StoreProduct, StoreResult } from "@/domain/store";
import { USER_AGENT } from "@/providers/http";
import { parseConnection, parseOrders, parseProducts, parseScopes, parseShop, refusedAddresses } from "./shopify-parse";

/**
 * Reads the owner's own Shopify store through a Dev Dashboard app installed on it: the client ID and
 * secret are traded for a 24-hour token (client credentials grant), then the Admin GraphQL API is read.
 * Read-only: no query here writes anything. Secrets and tokens never leave this module.
 */

const API_VERSION = "2026-10";
const TIMEOUT_MS = 15_000;
/** Products and orders are read by pages of this size, up to these many pages. */
const PAGE_SIZE = 250;
const PRODUCT_PAGES = 2;
const ORDER_PAGES = 4;
const ORDER_MONTHS = 12;
/** Tokens last 24 hours: one is kept until an hour before it expires. */
const TOKEN_MARGIN_MS = 60 * 60 * 1000;

const STORE_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export interface ShopifyConfig {
  readonly domain: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

/** The store's xxx.myshopify.com address, as typed with or without https:// and a trailing slash. */
export function normaliseStoreDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function isStoreDomain(domain: string): boolean {
  return STORE_DOMAIN.test(domain);
}

export function shopifyConfig(env: ServerEnv): ShopifyConfig | null {
  if (!env.SHOPIFY_STORE_DOMAIN || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) return null;
  return { domain: normaliseStoreDomain(env.SHOPIFY_STORE_DOMAIN), clientId: env.SHOPIFY_CLIENT_ID, clientSecret: env.SHOPIFY_CLIENT_SECRET };
}

export type Step<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: StoreFailure };

const tokens = new Map<string, { readonly token: string; readonly until: number }>();

async function accessToken(config: ShopifyConfig, fetchImpl: typeof fetch, now: number): Promise<Step<string>> {
  const key = `${config.domain}|${config.clientId}`;
  const known = tokens.get(key);
  if (known && known.until > now) return { ok: true, value: known.token };
  let response: Response;
  try {
    response = await fetchImpl(`https://${config.domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: config.clientId, client_secret: config.clientSecret }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "unreachable" };
  }
  const body = (await response.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown; error?: unknown };
  if (response.ok && typeof body.access_token === "string") {
    const seconds = typeof body.expires_in === "number" ? body.expires_in : 86_399;
    tokens.set(key, { token: body.access_token, until: now + seconds * 1000 - TOKEN_MARGIN_MS });
    return { ok: true, value: body.access_token };
  }
  // Shopify's own code only: the body could echo what was sent.
  if (body.error === "shop_not_permitted") return { ok: false, code: "not_permitted" };
  if (body.error === "invalid_client") return { ok: false, code: "invalid_credentials" };
  if (response.status === 404) return { ok: false, code: "unreachable" };
  return { ok: false, code: "not_installed" };
}

export interface GraphqlAnswer {
  readonly data?: Record<string, unknown>;
  readonly errors?: unknown;
}

async function graphql(config: ShopifyConfig, token: string, query: string, variables: Record<string, unknown>, fetchImpl: typeof fetch): Promise<Step<GraphqlAnswer>> {
  let response: Response;
  try {
    response = await fetchImpl(`https://${config.domain}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token, "User-Agent": USER_AGENT },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "unreachable" };
  }
  if (response.status === 401 || response.status === 403) return { ok: false, code: "invalid_credentials" };
  if (!response.ok) return { ok: false, code: "api_error" };
  const body = (await response.json().catch(() => null)) as GraphqlAnswer | null;
  return body ? { ok: true, value: body } : { ok: false, code: "api_error" };
}

const SHOP_QUERY = `{
  shop { name myshopifyDomain currencyCode taxesIncluded plan { displayName } shipsToCountries }
  currentAppInstallation { accessScopes { handle } }
}`;

const PRODUCTS_QUERY = `query Products($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: TITLE) {
    nodes {
      id title handle status vendor productType totalInventory tracksInventory onlineStoreUrl
      priceRangeV2 { minVariantPrice { amount } maxVariantPrice { amount } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const orderFields = (withAddress: boolean) => `
  id createdAt test cancelledAt
  ${withAddress ? "shippingAddress { countryCodeV2 }" : ""}
  totalPriceSet { shopMoney { amount } }
  totalTaxSet { shopMoney { amount } }
  totalShippingPriceSet { shopMoney { amount } }
  totalRefundedSet { shopMoney { amount } }
  lineItems(first: 50) { nodes { title quantity originalTotalSet { shopMoney { amount } } product { id } } }`;

const ordersQuery = (withAddress: boolean) => `query Orders($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
    nodes { ${orderFields(withAddress)} }
    pageInfo { hasNextPage endCursor }
  }
}`;

async function readPages<T>(
  read: (after: string | null) => Promise<Step<GraphqlAnswer>>,
  pick: (data: Record<string, unknown>) => unknown,
  parse: (nodes: readonly unknown[]) => T[],
  maxPages: number,
): Promise<Step<{ items: T[]; capped: boolean; errors: unknown }>> {
  const items: T[] = [];
  let after: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const answer = await read(after);
    if (!answer.ok) return answer;
    const connection = answer.value.data ? parseConnection(pick(answer.value.data)) : null;
    if (!connection) return { ok: true, value: { items, capped: false, errors: answer.value.errors } };
    items.push(...parse(connection.nodes));
    after = connection.next;
    if (!after) return { ok: true, value: { items, capped: false, errors: answer.value.errors } };
  }
  return { ok: true, value: { items, capped: true, errors: undefined } };
}

export interface ShopifyDeps {
  readonly fetch: typeof fetch;
  readonly now: () => number;
}

const DEFAULT_DEPS: ShopifyDeps = { fetch: (input, init) => fetch(input, init), now: () => Date.now() };

export type AskShopify = (query: string, variables?: Record<string, unknown>) => Promise<Step<GraphqlAnswer>>;

/** A ready-to-use reader of the store's Admin API, or why there is none. */
export async function openShopify(env: ServerEnv, deps: ShopifyDeps = DEFAULT_DEPS): Promise<Step<{ readonly domain: string; readonly ask: AskShopify }>> {
  const config = shopifyConfig(env);
  if (!config) return { ok: false, code: "not_configured" };
  if (!isStoreDomain(config.domain)) return { ok: false, code: "invalid_domain" };
  const token = await accessToken(config, deps.fetch, deps.now());
  if (!token.ok) return token;
  return { ok: true, value: { domain: config.domain, ask: (query, variables = {}) => graphql(config, token.value, query, variables, deps.fetch) } };
}

/** The store, its products and the orders of the last twelve months. */
export async function readStore(env: ServerEnv, deps: ShopifyDeps = DEFAULT_DEPS): Promise<StoreResult> {
  const opened = await openShopify(env, deps);
  if (!opened.ok) return opened;
  const now = deps.now();
  const { ask } = opened.value;

  const shopAnswer = await ask(SHOP_QUERY);
  if (!shopAnswer.ok) return shopAnswer;
  const shop = parseShop(shopAnswer.value.data?.shop);
  if (!shop) return { ok: false, code: "api_error" };

  const products = await readPages<StoreProduct>((after) => ask(PRODUCTS_QUERY, { first: PAGE_SIZE, after }), (data) => data.products, parseProducts, PRODUCT_PAGES);
  if (!products.ok) return products;

  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - ORDER_MONTHS, 1);
  const sinceDay = since.toISOString().slice(0, 10);
  const readOrders = (withAddress: boolean) =>
    readPages<StoreOrder>((after) => ask(ordersQuery(withAddress), { first: PAGE_SIZE, after, query: `created_at:>=${sinceDay}` }), (data) => data.orders, parseOrders, ORDER_PAGES);

  let orders = await readOrders(true);
  let countriesHidden = false;
  // Addresses are protected customer data: without that access, the orders are still worth reading.
  if (orders.ok && orders.value.items.length === 0 && refusedAddresses(orders.value.errors)) {
    countriesHidden = true;
    orders = await readOrders(false);
  }
  if (!orders.ok) return orders;

  return {
    ok: true,
    snapshot: {
      shop,
      products: products.value.items,
      productsCapped: products.value.capped,
      orders: orders.value.items,
      ordersCapped: orders.value.capped,
      ordersSince: sinceDay,
      countriesHidden,
      grantedScopes: parseScopes(shopAnswer.value.data?.currentAppInstallation),
      readAt: new Date(now).toISOString(),
    },
  };
}

/** For tests: forget the cached tokens. */
export function clearShopifyTokens(): void {
  tokens.clear();
}
