import { describe, expect, it } from "vitest";
import { countriesToPrice, parseStorefrontPrice, parseStorefrontShop, readStorefront } from "./shop-storefront";
import type { FetchDeps } from "./safe-fetch";

const shopAnswer = {
  data: {
    shop: { paymentSettings: { currencyCode: "EUR", enabledPresentmentCurrencies: ["CHF", "EUR"] } },
    localization: { availableLanguages: [{ isoCode: "FR" }], availableCountries: [{ isoCode: "BE" }, { isoCode: "CH" }, { isoCode: "FR" }, { isoCode: "LU" }] },
    products: { nodes: [{ title: "Samba OG", handle: "samba-og", availableForSale: true, priceRange: { minVariantPrice: { amount: "120.0", currencyCode: "EUR" } } }] },
  },
};
const priceAnswer = (amount: string, currency: string, compare = "0.0", available = true) => ({
  data: { product: { availableForSale: available, priceRange: { minVariantPrice: { amount, currencyCode: currency }, maxVariantPrice: { amount, currencyCode: currency } }, compareAtPriceRange: { maxVariantPrice: { amount: compare, currencyCode: currency } } } },
});

describe("Shopify Storefront API, tokenless", () => {
  it("reads the shop: currencies, languages, countries and its own best-selling order", () => {
    expect(parseStorefrontShop(JSON.stringify(shopAnswer))).toEqual({
      baseCurrency: "EUR",
      currencies: ["CHF", "EUR"],
      languages: ["FR"],
      countries: ["BE", "CH", "FR", "LU"],
      bestSellers: [{ title: "Samba OG", handle: "samba-og", available: true, priceMin: 120, currency: "EUR" }],
    });
    expect(parseStorefrontShop(JSON.stringify({ errors: [{ message: "access denied" }] }))).toBeNull();
    expect(parseStorefrontShop("<html>")).toBeNull();
  });

  it("reads a country's price in its currency, and a struck-out price only when there is one", () => {
    expect(parseStorefrontPrice(JSON.stringify(priceAnswer("137.0", "CHF")), "CH")).toEqual({ country: "CH", currency: "CHF", min: 137, max: 137, compareAtMax: null, available: true });
    expect(parseStorefrontPrice(JSON.stringify(priceAnswer("99.0", "EUR", "129.0", false)), "FR")).toMatchObject({ compareAtMax: 129, available: false });
    expect(parseStorefrontPrice(JSON.stringify({ data: { product: null } }), "FR")).toBeNull();
  });

  it("prices the usual markets first, five at most", () => {
    expect(countriesToPrice(["LU", "BE", "FR", "CH"])).toEqual(["FR", "CH", "BE", "LU"]);
    expect(countriesToPrice(["AU", "CA", "NL", "BE", "IT", "ES", "CH", "US", "GB", "DE", "FR"])).toHaveLength(5);
  });

  it("asks the official endpoint by POST, paced, one country at a time", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const deps: FetchDeps = {
      lookup: async () => ["93.184.216.34"],
      fetch: async (input, init) => {
        calls.push({ url: String(input), body: String(init?.body) });
        const country = /"country":"([A-Z]{2})"/.exec(String(init?.body))?.[1];
        return new Response(JSON.stringify(country ? priceAnswer("100.0", country === "CH" ? "CHF" : "EUR") : shopAnswer), { headers: { "content-type": "application/json" } });
      },
    };
    const paused: number[] = [];
    const read = await readStorefront("https://shop.example", "samba-og", deps, async (ms) => void paused.push(ms), 900);
    expect(calls[0].url).toBe("https://shop.example/api/2026-10/graphql.json");
    expect(read?.prices.map((p) => `${p.country}:${p.currency}`)).toEqual(["FR:EUR", "CH:CHF", "BE:EUR", "LU:EUR"]);
    expect(paused).toEqual([900, 900, 900, 900]);
    expect(calls).toHaveLength(5);
  });

  it("asks no price without a product, and gives up when it is not a Storefront answer", async () => {
    const deps = (body: string): FetchDeps => ({ lookup: async () => ["93.184.216.34"], fetch: async () => new Response(body, { headers: { "content-type": "application/json" } }) });
    expect((await readStorefront("https://shop.example", null, deps(JSON.stringify(shopAnswer)), async () => undefined, 0))?.prices).toEqual([]);
    expect(await readStorefront("https://shop.example", "x", deps("{}"), async () => undefined, 0)).toBeNull();
  });
});
