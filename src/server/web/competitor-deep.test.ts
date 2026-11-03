import { describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/config/env";
import { competitorResponseSchema } from "@/domain/web";
import { MemoryCacheRepository } from "@/server/repositories/memory-repositories";
import { analyzeCompetitor } from "./competitor";
import { parseArchive, parseRdap, parseTranco, readDomainSignals } from "./domain-signals";
import type { FetchDeps } from "./safe-fetch";
import { readCatalogue, summariseCatalogue, type CatalogueProduct } from "./shop-catalogue";
import { bestSellerCollection, bestSellersOf, parseCollections, parseShopProfile, presenceOf, productHandlesInOrder } from "./shop-profile";
import { createSiteReader } from "./safe-fetch";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Page = string | { readonly body: string; readonly type: string } | { readonly status: number };
const site = (pages: Record<string, Page>): FetchDeps => ({
  lookup: async () => ["93.184.216.34"],
  fetch: vi.fn(async (input: string) => {
    const page = pages[String(input)];
    if (page === undefined) return new Response("", { status: 404 });
    if (typeof page === "string") return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
    if ("status" in page) return new Response("", { status: page.status });
    return new Response(page.body, { headers: { "content-type": page.type } });
  }) as unknown as typeof fetch,
});

const META = {
  id: 84748042570,
  name: "L'AUTHENTIK'",
  city: "Paris",
  country: "FR",
  currency: "EUR",
  description: "retrouvez vos plus belles paires",
  ships_to_countries: ["BE", "FR", "DE"],
  published_collections_count: 28,
  published_products_count: 3114,
  offers_shop_pay_installments: false,
};

const product = (handle: string, extra: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  title: handle.toUpperCase(),
  handle,
  vendor: "Nike",
  product_type: "sneakers",
  tags: ["EXPRESS", "sneakers"],
  published_at: "2026-10-01T00:00:00Z",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-11-02T10:00:00Z",
  variants: [{ id: 1, title: "42", price: "120.00", compare_at_price: "150.00", available: true }],
  ...extra,
});

describe("what a Shopify shop publishes about itself", () => {
  it("reads its card, and refuses what is not one", () => {
    expect(parseShopProfile(JSON.stringify(META))).toEqual({
      name: "L'AUTHENTIK'",
      city: "Paris",
      country: "FR",
      currency: "EUR",
      description: "retrouvez vos plus belles paires",
      shipsTo: ["BE", "DE", "FR"],
      productCount: 3114,
      collectionCount: 28,
      installments: false,
    });
    expect(parseShopProfile("{}")).toBeNull();
    expect(parseShopProfile("<html>")).toBeNull();
  });

  it("lists best sellers in the page's order, from its main part, once each", () => {
    const html = `<header><a href="/products/menu-item">menu</a></header><main>
      <a href="/collections/all/products/samba-og">1</a><a href="/collections/all/products/samba-og">again</a>
      <a href="https://shop.example/fr/products/gel-nyc?variant=2">2</a><a href="/products/labubu">3</a></main>`;
    const handles = productHandlesInOrder(html);
    expect(handles).toEqual(["samba-og", "gel-nyc", "labubu"]);
    const best = bestSellersOf(handles, [product("gel-nyc")], "https://shop.example", "gel-nyc");
    expect(best[1]).toEqual({ rank: 2, title: "GEL-NYC", url: "https://shop.example/products/gel-nyc", price: 120, available: true, checked: true });
    expect(best[0]).toMatchObject({ rank: 1, title: "samba-og", price: null, available: null, checked: false });
  });

  it("reads collections, largest first, without the catch-all ones", () => {
    const body = JSON.stringify({ collections: [{ title: "All", handle: "all", products_count: 3000 }, { title: "Adidas", handle: "adidas", products_count: 710 }, { title: "-150€", handle: "moins-150", products_count: 1813 }] });
    expect(parseCollections(body)).toEqual([{ title: "-150€", count: 1813 }, { title: "Adidas", count: 710 }]);
  });

  it("finds the shop's accounts, theme and languages, never share buttons", () => {
    const html = `<a href="https://www.instagram.com/authentiksneakers/">ig</a><a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a>
      <a href="https://www.facebook.com/people/LAUTHENTIKSneakers/61567793196096/">fb</a><a href="https://www.tiktok.com/@authentik">tt</a>
      <script>Shopify.theme = {"name":"custom","id":1,"schema_name":"Dawn","schema_version":"15.4.0","role":"main"};</script>
      <link rel="alternate" hreflang="fr-FR" href="/"><link rel="alternate" hreflang="en" href="/en">`;
    const presence = presenceOf(html, []);
    expect(presence.social.map((s) => s.network)).toEqual(["instagram", "facebook", "tiktok"]);
    expect(presence.social[1]?.url).toContain("/people/");
    expect(presence.theme).toEqual({ name: "custom", schema: "Dawn", version: "15.4.0" });
    expect(presence.languages).toEqual(["en", "fr"]);
  });
});

describe("the catalogue in figures", () => {
  it("counts types, tags, discounts, sold-out products, launches and updates", () => {
    const catalogue = summariseCatalogue(
      [
        product("a"),
        product("b", { variants: [{ id: 2, price: "80.00", available: false }], published_at: "2026-06-15T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", product_type: "collectibles", tags: "rare, sneakers" }),
      ],
      "https://s.example",
      NOW,
      { pagesRead: 1, capped: false },
    );
    expect(catalogue).toMatchObject({ counted: 2, discounted: 1, soldOut: 1, updated24h: 1, updated7d: 1, autoUpdated: false, pagesRead: 1 });
    expect(catalogue?.discountAverage).toBeCloseTo(0.2);
    expect(catalogue?.types).toEqual([{ name: "collectibles", count: 1 }, { name: "sneakers", count: 1 }]);
    expect(catalogue?.tags[0]).toEqual({ name: "sneakers", count: 2 });
    expect(catalogue?.launchesByMonth).toHaveLength(12);
    expect(catalogue?.launchesByMonth.at(-1)).toEqual({ month: "2026-11", count: 0 });
    expect(catalogue?.launchesByMonth.find((m) => m.month === "2026-10")?.count).toBe(1);
  });

  it("sees an app updating every product, whose updates then say nothing of sales", () => {
    const products = Array.from({ length: 30 }, (_, i) => product(`p${i}`));
    expect(summariseCatalogue(products, "https://s.example", NOW, { pagesRead: 1, capped: false })?.autoUpdated).toBe(true);
  });

  it("reads page after page, and keeps what it has when the shop asks to slow down", async () => {
    const page = (count: number, from: number) => ({ body: JSON.stringify({ products: Array.from({ length: count }, (_, i) => product(`p${from + i}`)) }), type: "application/json" });
    const shop = site({
      "https://s.example/products.json?limit=250&page=1": page(250, 0),
      "https://s.example/products.json?limit=250&page=2": { status: 429 },
    });
    const read = await readCatalogue("https://s.example", createSiteReader(shop, async () => undefined), NOW);
    expect(read.state).toBe("partial");
    expect(read.catalogue).toMatchObject({ counted: 250, capped: true, pagesRead: 1 });

    const small = site({ "https://s.example/products.json?limit=250&page=1": page(3, 0) });
    const done = await readCatalogue("https://s.example", createSiteReader(small, async () => undefined), NOW);
    expect(done).toMatchObject({ state: "read", catalogue: { counted: 3, capped: false } });
  });
});

describe("the domain's age and popularity", () => {
  it("reads the registration, the first archived month and the Tranco rank", () => {
    expect(parseRdap({ events: [{ eventAction: "expiration", eventDate: "2026-11-11T14:46:35Z" }, { eventAction: "registration", eventDate: "2024-11-11T14:46:35Z" }] })).toBe("2024-11-11T14:46:35.000Z");
    expect(parseArchive([["timestamp"], ["20241113095606"], ["20250109152447"]])).toEqual({ first: "2024-11-13T09:56:06Z", months: 2 });
    expect(parseTranco({ ranks: [] })).toEqual({ rank: null, before: null, listed: false });
    expect(parseTranco({ ranks: [{ date: "2026-11-01", rank: 21841 }, { date: "2026-10-01", rank: 25000 }, { date: "2026-10-31", rank: 22074 }] })).toEqual({ rank: 21841, before: 25000, listed: true });
  });

  it("asks the three registries once, sends only the domain, and keeps a complete answer", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("https://rdap.org/")) return json({ events: [{ eventAction: "registration", eventDate: "2024-11-11T14:46:35Z" }] });
      if (url.startsWith("https://web.archive.org/")) return json([["timestamp"], ["20241113095606"]]);
      return json({ ranks: [] });
    });
    const cache = new MemoryCacheRepository();
    const first = await readDomainSignals("www.authentiksneakers.com", { fetch: fetchImpl as unknown as typeof fetch, cache });
    expect(first?.signals).toMatchObject({ registeredAt: "2024-11-11T14:46:35.000Z", archivedMonths: 1, trancoRank: null, outsideTranco: true });
    expect(first?.parts).toEqual({ rdap: "read", archive: "read", tranco: "absent" });
    expect(calls.every((url) => url.includes("authentiksneakers.com") && !url.includes("www."))).toBe(true);
    await readDomainSignals("authentiksneakers.com", { fetch: fetchImpl as unknown as typeof fetch, cache });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(await readDomainSignals("localhost", { fetch: fetchImpl as unknown as typeof fetch })).toBeNull();
  });
});

describe("a deep check of a Shopify shop", () => {
  const env = { SEARXNG_URL: "http://127.0.0.1:8888", SEARXNG_AUTOSTART: false, PROVIDER_HTTP_TIMEOUT_MS: 5000 } as unknown as ServerEnv;
  const productHtml = `<html><head><script src="https://cdn.shopify.com/a.js"></script>
    <script type="application/ld+json">{"@type":"Product","name":"Samba OG","aggregateRating":{"ratingValue":4.8,"reviewCount":40}}</script></head>
    <body><div class="jdgm-all-reviews-text__text" data-score="4.9" data-number-of-reviews="120"></div><a href="https://www.instagram.com/shop/">ig</a></body></html>`;
  const productJs = JSON.stringify({ title: "Samba OG", vendor: "Adidas", published_at: "2026-01-02T00:00:00Z", price_min: 12000, price_max: 12000, variants: [{ title: "42", price: 12000, available: true }] });
  const catalogue = (available: boolean) => ({ body: JSON.stringify({ products: [product("samba-og", { variants: [{ id: 1, price: "120.00", available }] }), product("gel-nyc")] }), type: "application/json" });
  const shop = (available: boolean) =>
    site({
      "https://shop.example/products/samba-og": productHtml,
      "https://shop.example/products/samba-og.js": { body: productJs, type: "application/json" },
      "https://shop.example/meta.json": { body: JSON.stringify(META), type: "application/json" },
      "https://shop.example/products.json?limit=250&page=1": catalogue(available),
      "https://shop.example/collections/all?sort_by=best-selling": `<main><a href="/products/gel-nyc">1</a><a href="/products/samba-og">2</a></main>`,
      "https://shop.example/collections.json?limit=250": { body: JSON.stringify({ collections: [{ title: "Adidas", handle: "adidas", products_count: 710 }] }), type: "application/json" },
    });
  const registries = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://rdap.org/")) return json({ events: [{ eventAction: "registration", eventDate: "2024-11-11T00:00:00Z" }] });
    if (url.startsWith("https://web.archive.org/")) return json([["timestamp"], ["20241113095606"]]);
    return json({ ranks: [] });
  });
  const noModel = { loadEngine: async () => ({ ok: false as const, reason: "x", failure: { code: "model_missing" as const, file: "m.gguf" } }) };

  it("gathers the card, catalogue, best sellers, domain, estimates and sources, then compares the next check", async () => {
    const cache = new MemoryCacheRepository();
    const searchDown = { fetch: (async () => new Response("", { status: 500 })) as unknown as typeof fetch, launch: () => undefined, sleep: async () => undefined };
    const deps = { env, search: searchDown, reading: noModel, now: () => NOW, paceMs: 0, cache: async () => cache, domain: { fetch: registries as unknown as typeof fetch }, adLibrary: async () => null };
    const first = await analyzeCompetitor("https://shop.example/products/samba-og", { searchSupplier: false, deep: true }, "fr", { ...deps, fetch: shop(true) });
    expect(competitorResponseSchema.safeParse(first).success).toBe(true);
    if (first.status !== "ready") throw new Error("expected ready");
    expect(first.profile).toMatchObject({ name: "L'AUTHENTIK'", productCount: 3114, shipsTo: ["BE", "DE", "FR"] });
    expect(first.bestSellers.map((b) => [b.rank, b.checked])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(first.domainSignals).toMatchObject({ registeredAt: "2024-11-11T00:00:00.000Z", outsideTranco: true });
    expect(first.presence?.collections).toEqual([{ title: "Adidas", count: 710 }]);
    expect(first.estimates.product).toMatchObject({ basis: "product", reviews: 40, ageFrom: "product_published", confidence: "medium" });
    expect(first.estimates.shop).toMatchObject({ basis: "shop", reviews: 120, ageFrom: "domain_registered", price: 120 });
    expect(first.adLibrary).toMatchObject({ state: "not_configured", term: "L'AUTHENTIK'", country: "FR" });
    expect(first.watch).toMatchObject({ readings: 1, changes: null });
    expect(first.sources).toEqual(expect.arrayContaining([{ id: "catalogue", state: "read" }, { id: "best_sellers", state: "read" }, { id: "tranco", state: "absent" }, { id: "suppliers", state: "limited" }]));

    const later = await analyzeCompetitor("https://shop.example/products/samba-og", { searchSupplier: false, deep: true }, "fr", { ...deps, fetch: shop(false), now: () => NOW + 3_600_000 });
    if (later.status !== "ready") throw new Error("expected ready");
    expect(later.watch).toMatchObject({ readings: 2, changes: { soldOut: 1, compared: 2, movers: [{ title: "SAMBA-OG", soldOut: 1 }] } });
  });

  it("respects a robots.txt forbidding the sorted pages, and reads the shop's best-sellers collection instead", async () => {
    expect(bestSellerCollection(JSON.stringify({ collections: [{ title: "Nike", handle: "nike" }, { title: "Top ventes", handle: "top-ventes" }] }))).toEqual({ handle: "top-ventes", title: "Top ventes" });
    expect(bestSellerCollection(JSON.stringify({ collections: [{ title: "Nike", handle: "nike" }] }))).toBeNull();
    const fetchImpl = site({
      "https://shop.example/robots.txt": { body: "User-agent: *\nDisallow: /collections/*sort_by*", type: "text/plain" },
      "https://shop.example/products/samba-og": productHtml,
      "https://shop.example/collections.json?limit=250": { body: JSON.stringify({ collections: [{ title: "Top ventes", handle: "top-ventes", products_count: 2 }] }), type: "application/json" },
      "https://shop.example/collections/top-ventes/products.json?limit=24": { body: JSON.stringify({ products: [product("labubu"), product("samba-og")] }), type: "application/json" },
    });
    const result = await analyzeCompetitor("https://shop.example/products/samba-og", { searchSupplier: false, deep: false }, "fr", { env, fetch: fetchImpl, reading: noModel, now: () => NOW, paceMs: 0, cache: async () => null });
    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.bestSellersFrom).toBe("collection");
    expect(result.bestCollection).toBe("Top ventes");
    expect(result.bestSellers.map((b) => [b.title, b.rank, b.checked])).toEqual([
      ["LABUBU", 1, false],
      ["SAMBA-OG", 2, true],
    ]);
    expect(result.sources).toContainEqual({ id: "best_sellers", state: "partial" });
  });

  it("asks no registry and no marketplace when the check is not deep", async () => {
    registries.mockClear();
    const result = await analyzeCompetitor("https://shop.example/products/samba-og", { searchSupplier: false, deep: false }, "fr", { env, fetch: shop(true), reading: noModel, now: () => NOW, paceMs: 0, cache: async () => null, domain: { fetch: registries as unknown as typeof fetch } });
    if (result.status !== "ready") throw new Error("expected ready");
    expect(registries).not.toHaveBeenCalled();
    expect(result.domainSignals).toBeNull();
    expect(result.adLibrary).toBeNull();
    expect(result.watch).toBeNull();
    expect(result.estimates.shop?.ageFrom).toBe("oldest_product");
  });
});
