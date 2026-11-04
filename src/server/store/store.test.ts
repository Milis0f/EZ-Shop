import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/config/env";
import { clearAdsCache, countryOfCriterion, keptAds, metaAccountId, parseGoogleDays, parseGoogleRows, parseMetaDays, parseMetaInsights, readAds, readGoogleAds, readMetaAds, totalOf } from "./ads";
import { clearShopifyTokens, isStoreDomain, normaliseStoreDomain, readStore } from "./shopify";
import { parseOrders, parseProducts, parseShop, refusedAddresses } from "./shopify-parse";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  clearShopifyTokens();
  clearAdsCache();
});

describe("Shopify answers", () => {
  it("reads the shop and keeps real countries only", () => {
    expect(parseShop({ name: "Ma boutique", myshopifyDomain: "x.myshopify.com", currencyCode: "EUR", taxesIncluded: true, plan: { displayName: "Basic" }, shipsToCountries: ["FR", "REST_OF_WORLD", "BE"] })).toEqual({
      name: "Ma boutique",
      domain: "x.myshopify.com",
      currency: "EUR",
      plan: "Basic",
      taxesIncluded: true,
      shipsTo: ["BE", "FR"],
      primaryUrl: null,
    });
    expect(parseShop({ name: "B", myshopifyDomain: "b.myshopify.com", currencyCode: "EUR", primaryDomain: { url: "https://boutique.example/" } })?.primaryUrl).toBe("https://boutique.example");
    expect(parseShop({ name: "B", myshopifyDomain: "b.myshopify.com", currencyCode: "EUR", primaryDomain: { url: "javascript:alert(1)" } })?.primaryUrl).toBeNull();
    expect(parseShop({ name: 1 })).toBeNull();
  });

  it("reads products, with no stock figure when the inventory is not tracked", () => {
    const products = parseProducts([
      { id: "p1", title: "Lampe", handle: "lampe", status: "ACTIVE", totalInventory: 7, tracksInventory: true, priceRangeV2: { minVariantPrice: { amount: "29.90" }, maxVariantPrice: { amount: "34.90" } } },
      { id: "p2", title: "Ebook", handle: "ebook", status: "DRAFT", totalInventory: 0, tracksInventory: false },
      { broken: true },
    ]);
    expect(products).toEqual([
      expect.objectContaining({ id: "p1", priceMin: 29.9, priceMax: 34.9, inventory: 7 }),
      expect.objectContaining({ id: "p2", priceMin: null, inventory: null, status: "DRAFT" }),
    ]);
  });

  it("reads orders: money as decimals, country, refunds, cancellation and lines", () => {
    const [order] = parseOrders([
      {
        id: "o1",
        createdAt: "2026-10-01T10:00:00Z",
        test: true,
        cancelledAt: null,
        shippingAddress: { countryCodeV2: "BE" },
        totalPriceSet: { shopMoney: { amount: "54.90" } },
        totalTaxSet: { shopMoney: { amount: "9.15" } },
        totalShippingPriceSet: { shopMoney: { amount: "4.90" } },
        totalRefundedSet: { shopMoney: { amount: "0.0" } },
        lineItems: { nodes: [{ title: "Lampe", quantity: 2, originalTotalSet: { shopMoney: { amount: "50.00" } }, product: { id: "p1" } }] },
      },
    ]);
    expect(order).toEqual({ id: "o1", createdAt: "2026-10-01T10:00:00Z", country: "BE", total: 54.9, tax: 9.15, shipping: 4.9, refunded: 0, cancelled: false, test: true, lines: [{ productId: "p1", title: "Lampe", quantity: 2, total: 50 }] });
  });

  it("recognises a refusal of the addresses", () => {
    expect(refusedAddresses([{ message: "Access denied for shippingAddress field.", path: ["orders", "nodes", 0, "shippingAddress"] }])).toBe(true);
    expect(refusedAddresses([{ message: "Throttled" }])).toBe(false);
    expect(refusedAddresses(undefined)).toBe(false);
  });

  it("accepts only a myshopify.com address, typed in any usual way", () => {
    expect(normaliseStoreDomain(" https://C42anm-pu.myshopify.com/ ")).toBe("c42anm-pu.myshopify.com");
    expect(isStoreDomain("c42anm-pu.myshopify.com")).toBe(true);
    expect(isStoreDomain("evil.example.com")).toBe(false);
    expect(isStoreDomain("myshopify.com.evil.io")).toBe(false);
  });
});

describe("readStore", () => {
  const env = { SHOPIFY_STORE_DOMAIN: "shop.myshopify.com", SHOPIFY_CLIENT_ID: "id", SHOPIFY_CLIENT_SECRET: "secret" } as ServerEnv;
  const shop = { name: "Shop", myshopifyDomain: "shop.myshopify.com", currencyCode: "EUR", taxesIncluded: true, plan: { displayName: "Basic" }, shipsToCountries: ["FR"] };
  const page = (nodes: unknown[]) => ({ nodes, pageInfo: { hasNextPage: false, endCursor: null } });

  function fakeShopify(answer: (query: string) => unknown) {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/admin/oauth/access_token")) return json({ access_token: "token", scope: "read_products", expires_in: 86399 });
      const { query } = JSON.parse(String(init?.body)) as { query: string };
      return json(answer(query));
    });
    return { calls, deps: { fetch: fetchImpl as unknown as typeof fetch, now: () => Date.parse("2026-11-02T12:00:00Z") } };
  }

  it("reads the shop, its products and twelve months of orders, with the token kept for the next read", async () => {
    const { calls, deps } = fakeShopify((query) =>
      query.includes("shop {") ? { data: { shop, currentAppInstallation: { accessScopes: [{ handle: "read_products" }, { handle: "read_orders" }] } } } : query.includes("products(") ? { data: { products: page([{ id: "p1", title: "Lampe", handle: "lampe" }]) } } : { data: { orders: page([]) } },
    );
    const result = await readStore(env, deps);
    expect(result).toMatchObject({ ok: true, snapshot: { shop: { name: "Shop" }, products: [{ id: "p1" }], orders: [], ordersSince: "2025-11-01", countriesHidden: false, grantedScopes: ["read_orders", "read_products"] } });
    await readStore(env, deps);
    expect(calls.filter((url) => url.endsWith("/access_token"))).toHaveLength(1);
    expect(calls.every((url) => url.startsWith("https://shop.myshopify.com/"))).toBe(true);
  });

  it("still reads the orders without their country when Shopify refuses the addresses", async () => {
    const order = { id: "o1", createdAt: "2026-10-01T00:00:00Z", totalPriceSet: { shopMoney: { amount: "10" } }, lineItems: { nodes: [] } };
    const { deps } = fakeShopify((query) =>
      query.includes("shop {")
        ? { data: { shop } }
        : query.includes("products(")
          ? { data: { products: page([]) } }
          : query.includes("shippingAddress")
            ? { data: null, errors: [{ message: "Access denied for shippingAddress field." }] }
            : { data: { orders: page([order]) } },
    );
    const result = await readStore(env, deps);
    expect(result).toMatchObject({ ok: true, snapshot: { countriesHidden: true, orders: [{ id: "o1", country: null }] } });
  });

  it("names Shopify's refusals", async () => {
    const refusing = (error: string) => ({ fetch: vi.fn(async () => json({ error }, 400)) as unknown as typeof fetch, now: () => 0 });
    expect(await readStore(env, refusing("shop_not_permitted"))).toEqual({ ok: false, code: "not_permitted" });
    expect(await readStore(env, refusing("invalid_client"))).toEqual({ ok: false, code: "invalid_credentials" });
    expect(await readStore({} as ServerEnv)).toEqual({ ok: false, code: "not_configured" });
    expect(await readStore({ ...env, SHOPIFY_STORE_DOMAIN: "evil.example.com" })).toEqual({ ok: false, code: "invalid_domain" });
  });
});

const noFunnel = { reach: null, linkClicks: null, landingViews: null, addToCart: null, checkouts: null };

describe("Meta ads", () => {
  const countryRows = {
    data: [
      { spend: "40.50", impressions: "9000", clicks: "120", country: "FR", account_currency: "EUR", actions: [{ action_type: "purchase", value: "3" }, { action_type: "omni_purchase", value: "4" }], action_values: [{ action_type: "omni_purchase", value: "180" }] },
      { spend: "12", impressions: "3000", clicks: "30", country: "BE" },
    ],
  };

  it("takes Meta's merged purchase count, keeps the currency, and sorts by spend", () => {
    const parsed = parseMetaInsights(countryRows, (row) => row.country ?? "?");
    expect(parsed?.currency).toBe("EUR");
    expect(parsed?.rows).toEqual([
      { label: "FR", spend: 40.5, impressions: 9000, clicks: 120, purchases: 4, purchaseValue: 180, ...noFunnel },
      { label: "BE", spend: 12, impressions: 3000, clicks: 30, purchases: null, purchaseValue: null, ...noFunnel },
    ]);
    expect(totalOf(parsed?.rows ?? [], "total")).toEqual({ label: "total", spend: 52.5, impressions: 12000, clicks: 150, purchases: 4, purchaseValue: 180, linkClicks: null, landingViews: null, addToCart: null, checkouts: null });
  });

  it("reads each step from an ad to a purchase, and the days in order", () => {
    const [row] =
      parseMetaInsights(
        {
          data: [
            {
              spend: "10",
              impressions: "1000",
              clicks: "50",
              reach: "800",
              inline_link_clicks: "30",
              actions: [
                { action_type: "landing_page_view", value: "25" },
                { action_type: "offsite_conversion.fb_pixel_add_to_cart", value: "6" },
                { action_type: "omni_add_to_cart", value: "7" },
                { action_type: "initiate_checkout", value: "3" },
              ],
            },
          ],
        },
        () => "total",
      )?.rows ?? [];
    expect(row).toMatchObject({ reach: 800, linkClicks: 30, landingViews: 25, addToCart: 7, checkouts: 3, purchases: null });
    expect(parseMetaDays({ data: [{ date_start: "2026-10-02", spend: "2" }, { date_start: "2026-10-01", spend: "5" }, { spend: "1" }] })).toEqual([
      { day: "2026-10-01", spend: 5, impressions: 0, clicks: 0, purchases: null },
      { day: "2026-10-02", spend: 2, impressions: 0, clicks: 0, purchases: null },
    ]);
  });

  it("asks for the account's insights with the token in a header, never in the address", async () => {
    const urls: string[] = [];
    const headers: Array<Record<string, string>> = [];
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      urls.push(String(input));
      headers.push(init?.headers as Record<string, string>);
      return json(String(input).includes("level=campaign") ? { data: [{ campaign_name: "Hiver", spend: "52.5" }] } : countryRows);
    });
    const result = await readMetaAds({ META_ADS_ACCESS_TOKEN: "secret-token", META_AD_ACCOUNT_ID: "act_123" } as ServerEnv, { fetch: fetchImpl as unknown as typeof fetch });
    expect(result).toMatchObject({ ok: true, report: { platform: "meta", currency: "EUR", campaigns: [{ label: "Hiver" }] } });
    expect(urls).toHaveLength(4);
    expect(urls.some((url) => url.includes("time_increment=1"))).toBe(true);
    expect(urls.every((url) => url.startsWith("https://graph.facebook.com/v26.0/act_123/insights?") && !url.includes("secret-token"))).toBe(true);
    expect(urls.some((url) => url.includes("breakdowns=country"))).toBe(true);
    expect(headers[0]?.Authorization).toBe("Bearer secret-token");
  });

  it("reports an expired token, and stays quiet when not set up", async () => {
    const fetchImpl = vi.fn(async () => json({ error: { code: 190, message: "secret detail" } }, 400));
    expect(await readMetaAds({ META_ADS_ACCESS_TOKEN: "t", META_AD_ACCOUNT_ID: "1" } as ServerEnv, { fetch: fetchImpl as unknown as typeof fetch })).toEqual({ ok: false, code: "unauthorized" });
    expect(await readMetaAds({} as ServerEnv)).toEqual({ ok: false, code: "not_configured" });
    expect(metaAccountId(" act_987 ")).toBe("987");
  });
});

describe("Google ads", () => {
  it("turns micros into money, adds up rows of one label and names the country", () => {
    const parsed = parseGoogleRows(
      {
        results: [
          { geographicView: { countryCriterionId: "2250" }, metrics: { costMicros: "12500000", impressions: "1000", clicks: "40", conversions: 2, conversionsValue: 90 } },
          { geographicView: { countryCriterionId: "2250" }, metrics: { costMicros: "2500000", impressions: "100", clicks: "5" } },
          { geographicView: { countryCriterionId: "2156" }, metrics: { costMicros: "1000000" } },
        ],
      },
      (row) => countryOfCriterion(row.geographicView?.countryCriterionId),
    );
    expect(parsed?.rows[0]).toEqual({ label: "FR", spend: 15, impressions: 1100, clicks: 45, purchases: 2, purchaseValue: 90 });
    expect(parsed?.rows[1]?.label).toBe("#2156");
  });

  it("reads campaigns and countries of the account over 30 days", async () => {
    const env = { GOOGLE_ADS_API_VERSION: "v22", GOOGLE_ADS_CLIENT_ID: "c", GOOGLE_ADS_CLIENT_SECRET: "s", GOOGLE_ADS_REFRESH_TOKEN: "r", GOOGLE_ADS_CUSTOMER_ID: "123-456-7890" } as ServerEnv;
    const queries: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes("oauth2")) return json({ access_token: "a" });
      const { query } = JSON.parse(String(init?.body)) as { query: string };
      queries.push(query);
      return json({ results: query.includes("FROM campaign") ? [{ campaign: { name: "Search FR" }, customer: { currencyCode: "EUR" }, metrics: { costMicros: "5000000" } }] : [] });
    });
    const result = await readGoogleAds(env, { fetch: fetchImpl as unknown as typeof fetch });
    expect(result).toMatchObject({ ok: true, report: { platform: "google", currency: "EUR", total: { spend: 5 }, campaigns: [{ label: "Search FR" }] } });
    expect(queries.every((q) => q.includes("LAST_30_DAYS"))).toBe(true);
    expect(queries.some((q) => q.startsWith("SELECT segments.date"))).toBe(true);
    expect(await readGoogleAds({} as ServerEnv)).toEqual({ ok: false, code: "not_configured" });
  });

  it("reads the spend day by day", () => {
    expect(parseGoogleDays({ results: [{ segments: { date: "2026-10-02" }, metrics: { costMicros: "3000000", clicks: "4" } }, { segments: { date: "2026-10-01" }, metrics: { costMicros: "1000000" } }] })).toEqual([
      { day: "2026-10-01", spend: 1, impressions: 0, clicks: 0, purchases: 0 },
      { day: "2026-10-02", spend: 3, impressions: 0, clicks: 4, purchases: 0 },
    ]);
  });
});

describe("kept ad reports", () => {
  const env = { META_ADS_ACCESS_TOKEN: "t", META_AD_ACCOUNT_ID: "1" } as ServerEnv;

  it("keeps a report ten minutes unless asked again, and never keeps a failure", async () => {
    let now = Date.parse("2026-11-02T12:00:00Z");
    const fetchImpl = vi.fn(async () => json({ data: [] }));
    const deps = { fetch: fetchImpl as unknown as typeof fetch, now: () => now };
    expect((await readAds("meta", env, { deps })).ok).toBe(true);
    await readAds("meta", env, { deps });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(keptAds("meta", now)?.ok).toBe(true);
    await readAds("meta", env, { deps, fresh: true });
    expect(fetchImpl).toHaveBeenCalledTimes(8);
    now += 11 * 60 * 1000;
    expect(keptAds("meta", now)).toBeNull();

    const failing = { fetch: vi.fn(async () => json({ error: { code: 190 } }, 400)) as unknown as typeof fetch, now: () => now };
    expect(await readAds("google", { ...env } as ServerEnv, { deps: failing })).toEqual({ ok: false, code: "not_configured" });
    expect(keptAds("google", now)).toBeNull();
  });
});
