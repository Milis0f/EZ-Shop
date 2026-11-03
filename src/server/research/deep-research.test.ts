import { describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/config/env";
import { deepEventSchema, type DeepEvent } from "@/domain/deep-research";
import { marginOf } from "@/engine/research/margin";
import type { EngineLoadResult, LocalAiEngine } from "@/server/ai/types";
import type { FetchDeps } from "@/server/web/safe-fetch";
import type { SearchDeps } from "@/server/web/searxng";
import { keepCited, materialFor } from "./deep-ai";
import { closestProduct, nameOverlap, SourceBook } from "./deep-gather";
import { runDeepResearch } from "./deep-research";

const env = { SEARXNG_URL: "http://127.0.0.1:8888", SEARXNG_AUTOSTART: false, PROVIDER_HTTP_TIMEOUT_MS: 5000 } as unknown as ServerEnv;

const searchDeps = (results: Array<{ url: string; title: string; content: string }>, up = true): SearchDeps => ({
  fetch: vi.fn(async (url: string) => {
    if (String(url).endsWith("/healthz")) return new Response("OK", { status: up ? 200 : 500 });
    return Response.json({ results });
  }) as unknown as typeof fetch,
  launch: vi.fn(),
  sleep: async () => undefined,
});

const site = (pages: Record<string, string | { body: string; type: string }>): FetchDeps => ({
  lookup: async () => ["93.184.216.34"],
  fetch: vi.fn(async (input: string) => {
    const page = pages[String(input)];
    if (page === undefined) return new Response("", { status: 404 });
    return typeof page === "string" ? new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } }) : new Response(page.body, { headers: { "content-type": page.type } });
  }) as unknown as typeof fetch,
});

const productPage = (name: string, price: number) =>
  `<html><head><title>${name}</title><script src="https://cdn.shopify.com/a.js"></script><script type="application/ld+json">{"@type":"Product","name":"${name}","offers":{"price":"${price}","priceCurrency":"EUR"}}</script></head><body><p>${name} en inox, garde au frais 24 heures.</p></body></html>`;

describe("deep research pieces", () => {
  it("numbers sources once each and keeps what was read of them", () => {
    const book = new SourceBook();
    expect(book.add("https://a.example/x", "A", "search")).toBe(1);
    expect(book.add("https://b.example/y", "B", "page", { read: true })).toBe(2);
    expect(book.add("https://a.example/x", "A again", "page", { read: true })).toBe(1);
    expect(book.get(1)).toMatchObject({ read: true, domain: "a.example", title: "A" });
  });

  it("matches the shop's product by the words of the name", () => {
    expect(nameOverlap("gourde inox", "Gourde isotherme inox 500 ml")).toBe(1);
    expect(nameOverlap("gourde inox", "Bouteille en verre")).toBe(0);
    const match = closestProduct(
      [
        { title: "Gourde inox 750 ml", handle: "gourde-inox", variants: [{ price: "19.90", compare_at_price: "29.90", available: true }] },
        { title: "Tasse", handle: "tasse", variants: [] },
      ],
      "gourde inox",
      "https://shop.example",
    );
    expect(match).toEqual({ title: "Gourde inox 750 ml", url: "https://shop.example/products/gourde-inox", price: 19.9, compareAt: 29.9 });
  });

  it("works out the margin at the owner's price and around it", () => {
    const margin = marginOf(25, 6, 4);
    expect(margin).toMatchObject({ sellingPrice: 25, landedCost: 10, margin: 15, marginPct: 60 });
    expect(margin?.byPrice).toHaveLength(6);
    expect(marginOf(undefined, 6, 4)).toBeNull();
  });

  it("drops points whose numbers are not in the material or that cite no real source", () => {
    const allowed = new Set(["19.9", "24"]);
    const kept = keepCited(
      {
        summary: "Prix vu à 19,90 €.",
        sections: [
          { id: "pricing", points: [{ text: "Une boutique vend à 19,90 €.", sources: [1] }, { text: "Marge de 99 %.", sources: [1] }] },
          { id: "risks", points: [{ text: "Concurrence forte.", sources: [42] }] },
        ],
        actions: [{ title: "Tester un prix", why: "Le prix vu est 19,90 €.", sources: [1, 7] }],
      },
      allowed,
      2,
      "fr",
    );
    expect(kept?.sections).toEqual([{ id: "pricing", points: [{ text: "Une boutique vend à 19,90 €.", sources: [1] }] }]);
    expect(kept?.actions[0]?.sources).toEqual([1]);
  });

  it("writes the material with the prices and each source's text", () => {
    const book = new SourceBook();
    const n = book.add("https://a.example/x", "Gourde A", "page", { read: true });
    book.setText(n, "Gourde inox 19,90 €");
    const material = materialFor(book, { product: "gourde inox", country: "France", prices: [{ source: n, name: "Gourde A", price: 19.9, currency: "EUR", rating: null, reviewCount: null }], shops: [], margin: null, extraFacts: [] });
    expect(material).toContain("[1] states the price 19.9 EUR");
    expect(material).toContain("[1] Gourde A (a.example)\nGourde inox 19,90 €");
  });
});

describe("a deep research", () => {
  const hits = [
    { url: "https://shop.example/products/gourde", title: "Gourde inox – Shop", content: "Gourde inox 500 ml" },
    { url: "https://blog.example/test-gourdes", title: "Test des gourdes", content: "Comparatif" },
    { url: "https://www.aliexpress.com/item/1005001.html", title: "Gourde inox isotherme", content: "AliExpress" },
  ];
  const pages = site({
    "https://shop.example/products/gourde": productPage("Gourde inox", 24),
    "https://blog.example/test-gourdes": "<html><head><title>Test des gourdes</title></head><body><p>Les gourdes inox coûtent souvent 24 €.</p></body></html>",
    "https://shop.example/meta.json": { body: JSON.stringify({ name: "Shop", country: "FR", published_products_count: 40 }), type: "application/json" },
    "https://shop.example/products.json?limit=250&page=1": { body: JSON.stringify({ products: [{ title: "Gourde inox", handle: "gourde", variants: [{ price: "24.00", available: true }] }] }), type: "application/json" },
  });

  function engine(answer: unknown, tools = true) {
    const completeJson = vi.fn<(request: { readonly user: string }) => Promise<unknown>>(async () => answer);
    const runWithTools = vi.fn(async (request: { tools: ReadonlyArray<{ name: string; handler: (p: unknown) => Promise<string> }> }) => {
      await request.tools.find((tool) => tool.name === "compute_margin")?.handler({ sellingPrice: 30, supplierCost: 8, shippingCost: 4 });
      return "done";
    });
    const e: LocalAiEngine = { model: { name: "Fake 9B", license: "MIT" }, completeJson, ...(tools ? { runWithTools } : {}) };
    return { completeJson, runWithTools, loadEngine: async (): Promise<EngineLoadResult> => ({ ok: true, engine: e }) };
  }

  const collect = () => {
    const events: DeepEvent[] = [];
    return { events, emit: (event: DeepEvent) => events.push(deepEventSchema.parse(event)) };
  };

  it("gathers, lets the AI use its tools, and writes a report that cites its sources", async () => {
    const ai = engine({
      summary: "Le prix courant est 24 €.",
      sections: [{ id: "pricing", points: [{ text: "Deux sources donnent 24 €.", sources: [1, 2] }] }],
      actions: [{ title: "Viser sous 24 €", why: "C'est le prix vu.", sources: [1] }],
    });
    const { events, emit } = collect();
    await runDeepResearch({ product: "gourde inox", country: "FR" }, "fr", emit, { env, search: searchDeps(hits), fetch: pages, now: () => 0, sleep: async () => undefined, loadEngine: ai.loadEngine });
    const report = events.find((e) => e.type === "report");
    if (report?.type !== "report") throw new Error("no report");
    const r = report.report;
    expect(r.sources.map((s) => s.domain)).toEqual(expect.arrayContaining(["shop.example", "blog.example", "aliexpress.com"]));
    expect(r.prices).toEqual([expect.objectContaining({ price: 24, currency: "EUR" })]);
    expect(r.shops).toEqual([expect.objectContaining({ domain: "shop.example", productCount: 40, match: expect.objectContaining({ price: 24 }) })]);
    expect(r.suppliers).toHaveLength(1);
    expect(r.toolCalls).toEqual([{ tool: "compute_margin", input: "30 / 8 / 4", ok: true }]);
    expect(r.ai?.sections[0]?.points[0]?.sources).toEqual([1, 2]);
    expect(r.aiNote).toBeNull();
    const steps = events.flatMap((e) => (e.type === "step" ? [e.step] : []));
    expect(steps).toEqual(expect.arrayContaining(["search", "read", "shops", "suppliers", "ai_tools", "ai_write", "done"]));
    expect(ai.completeJson.mock.calls[0]?.[0]).toMatchObject({ user: expect.stringContaining("Margin worked out: selling price 30") });
  });

  it("still gives what was gathered without the AI", async () => {
    const { events, emit } = collect();
    const off = async (): Promise<EngineLoadResult> => ({ ok: false, reason: "x", failure: { code: "disabled" } });
    await runDeepResearch({ product: "gourde inox", country: "FR", sellingPrice: 30, supplierPrice: 8, shippingCost: 4 }, "fr", emit, { env, search: searchDeps(hits), fetch: pages, now: () => 0, sleep: async () => undefined, loadEngine: off });
    const report = events.find((e) => e.type === "report");
    if (report?.type !== "report") throw new Error("no report");
    expect(report.report).toMatchObject({ ai: null, aiNote: "ai_off", margin: { marginPct: 60 } });
  });

  it("says when the search engine is missing", async () => {
    const { events, emit } = collect();
    await runDeepResearch({ product: "gourde inox", country: "FR" }, "fr", emit, { env, search: searchDeps([], false), fetch: pages, now: () => 0, loadEngine: engine({}).loadEngine });
    expect(events.at(-1)).toEqual({ type: "failed", code: "search_not_installed" });
  });
});
