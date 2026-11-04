import { afterEach, describe, expect, it } from "vitest";
import type { ServerEnv } from "@/config/env";
import { convert, marketOf, median } from "@/engine/store/market";
import { parseBrand } from "./brand";
import { accountOfPages, clearInstagramCache, instagramFailureOf, postsOf, reachSeries, readInstagram, totalsOf } from "./instagram";
import { candidateHits } from "./market";
import { assembleStripe, clearStripeCache, isRestrictedKey, readStripe, stripeFailureOf, toMajor, type StripeCharge } from "./stripe";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const NOW = Date.parse("2026-11-05T12:00:00Z");

afterEach(() => {
  clearInstagramCache();
  clearStripeCache();
});

describe("Instagram", () => {
  it("finds the professional account linked to a Page", () => {
    expect(accountOfPages({ data: [{}, { instagram_business_account: { id: "17", username: "shop", followers_count: 120 } }] })).toMatchObject({ id: "17", username: "shop", followers_count: 120 });
    expect(accountOfPages({ data: [{}] })).toBeNull();
  });

  it("reads reach day by day and totals, without inventing a missing metric", () => {
    const series = reachSeries({ data: [{ name: "reach", values: [{ value: 40, end_time: "2026-11-02T07:00:00+0000" }, { value: 55, end_time: "2026-11-03T07:00:00+0000" }] }] });
    expect(series).toEqual([
      { day: "2026-11-02", value: 40 },
      { day: "2026-11-03", value: 55 },
    ]);
    expect(totalsOf({ data: [{ name: "views", total_value: { value: 900 } }, { name: "reach", total_value: { value: 300 } }] })).toEqual({ views: 900, reach: 300, accountsEngaged: null, interactions: null, linkTaps: null });
  });

  it("keeps https images only and a video's cover, not its file", () => {
    const posts = postsOf({
      data: [
        { id: "1", media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-11-01T10:00:00Z", media_url: "https://cdn/video.mp4", thumbnail_url: "https://cdn/cover.jpg", like_count: 3 },
        { id: "2", media_type: "IMAGE", timestamp: "2026-11-01T10:00:00Z", media_url: "javascript:alert(1)", permalink: "http://insecure" },
      ],
    });
    expect(posts[0]).toMatchObject({ type: "REELS", thumbnail: "https://cdn/cover.jpg", likes: 3 });
    expect(posts[1]).toMatchObject({ thumbnail: null, permalink: null });
  });

  it("names Meta's refusals from their code only", () => {
    expect(instagramFailureOf(400, JSON.stringify({ error: { code: 190 } }))).toBe("unauthorized");
    expect(instagramFailureOf(400, JSON.stringify({ error: { code: 10 } }))).toBe("missing_permission");
    expect(instagramFailureOf(400, JSON.stringify({ error: { code: 4 } }))).toBe("rate_limited");
  });

  it("sends the token in a header, never in the address, and keeps the account when insights are refused", async () => {
    const urls: string[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      urls.push(url);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN");
      if (url.includes("me/accounts")) return json({ data: [{ instagram_business_account: { id: "17", username: "shop", followers_count: 5 } }] });
      if (url.includes("/insights")) return json({ error: { code: 10 } }, 400);
      return json({ data: [] });
    };
    const result = await readInstagram({ META_ADS_ACCESS_TOKEN: "TOKEN" } as ServerEnv, { fetch, now: () => NOW });
    expect(urls.every((u) => !u.includes("TOKEN"))).toBe(true);
    expect(result.ok && result.report).toMatchObject({ username: "shop", followers: 5, reachByDay: [], totals: { reach: null } });
  });

  it("says when no account is linked", async () => {
    const result = await readInstagram({ META_ADS_ACCESS_TOKEN: "T" } as ServerEnv, { fetch: async () => json({ data: [] }), now: () => NOW });
    expect(result).toEqual({ ok: false, code: "no_account" });
  });
});

const charge = (days: number, amount: number, extra: Partial<StripeCharge> = {}): StripeCharge => ({
  id: `ch_${days}_${amount}`,
  amount,
  amount_refunded: 0,
  currency: "eur",
  created: Math.floor((NOW - days * 86_400_000) / 1000),
  status: "succeeded",
  paid: true,
  disputed: false,
  payment_method_details: { type: "card", card: { brand: "visa", country: "FR" } },
  ...extra,
});

describe("Stripe", () => {
  it("accepts a restricted key only", () => {
    expect(isRestrictedKey("rk_live_abcdefghijklmno")).toBe(true);
    expect(isRestrictedKey("sk_live_abcdefghijklmno")).toBe(false);
  });

  it("counts zero-decimal currencies in whole units", () => {
    expect(toMajor(1099, "eur")).toBe(10.99);
    expect(toMajor(1099, "jpy")).toBe(1099);
  });

  it("splits the last 30 days from the 30 before, in the account currency only", () => {
    const report = assembleStripe(
      [charge(1, 5000), charge(2, 2000, { amount_refunded: 500, disputed: true }), charge(3, 999, { status: "failed", paid: false }), charge(40, 3000), charge(1, 7000, { currency: "usd" })],
      { available: [{ amount: 12_000, currency: "eur" }], pending: [{ amount: 500, currency: "eur" }] },
      NOW,
      false,
    );
    expect(report.current).toEqual({ gross: 70, refunded: 5, payments: 2, failed: 1, disputed: 1 });
    expect(report.previous.gross).toBe(30);
    expect(report.otherCurrencies).toBe(1);
    expect(report.available).toBe(120);
    expect(report.methods).toEqual([{ key: "visa", payments: 2 }]);
    expect(report.byDay).toHaveLength(30);
  });

  it("reads type and status only from Stripe's errors", () => {
    expect(stripeFailureOf(401, "{}")).toBe("unauthorized");
    expect(stripeFailureOf(403, JSON.stringify({ error: { type: "permission_error" } }))).toBe("missing_permission");
    expect(stripeFailureOf(429, "{}")).toBe("rate_limited");
  });

  it("refuses a secret key before any call", async () => {
    let called = false;
    const result = await readStripe({ STRIPE_API_KEY: "sk_live_abcdefghijklmnop" } as ServerEnv, {
      fetch: async () => {
        called = true;
        return json({});
      },
      now: () => NOW,
    });
    expect(result).toEqual({ ok: false, code: "unauthorized" });
    expect(called).toBe(false);
  });

  it("pages through charges and still shows payments when the balance is not readable", async () => {
    const pages = [
      { data: [charge(1, 1000)], has_more: true },
      { data: [charge(2, 2000)], has_more: false },
    ];
    let page = 0;
    const fetch = async (input: RequestInfo | URL) => (String(input).includes("/balance") ? json({ error: { type: "permission_error" } }, 403) : json(pages[page++]));
    const result = await readStripe({ STRIPE_API_KEY: "rk_test_abcdefghijklmnop" } as ServerEnv, { fetch, now: () => NOW });
    expect(result.ok && result.report.current.payments).toBe(2);
    expect(result.ok && result.report.available).toBeNull();
  });
});

describe("brand", () => {
  it("keeps https images and #rrggbb colours only", () => {
    const brand = parseBrand(JSON.stringify({ data: { shop: { brand: { slogan: " Hello ", logo: { image: { url: "https://cdn/logo.png" } }, squareLogo: { image: { url: "javascript:x" } }, colors: { primary: [{ background: "#1A2B3C" }], secondary: [{ background: "red;}" }] } } } } }));
    expect(brand).toEqual({ slogan: "Hello", logo: "https://cdn/logo.png", squareLogo: null, primary: "#1a2b3c", secondary: null });
  });

  it("is empty, not an error, for a shop without a brand set", () => {
    expect(parseBrand(JSON.stringify({ data: { shop: { brand: null } } }))).toEqual({ slogan: null, logo: null, squareLogo: null, primary: null, secondary: null });
    expect(parseBrand("<html>")).toBeNull();
  });
});

describe("market comparison", () => {
  it("converts through the euro at reference rates", () => {
    expect(convert(110, "USD", "EUR", { USD: 1.1 })).toBe(100);
    expect(convert(100, "EUR", "GBP", { GBP: 0.85 })).toBe(85);
    expect(convert(100, "XYZ", "EUR", {})).toBeNull();
  });

  it("compares only with sure matches and says where the store stands", () => {
    const sure = { domain: "a.example", url: "https://a.example/p", title: "x", price: 40, currency: "EUR", converted: 40, match: "strong" as const };
    const lookalike = { ...sure, domain: "b.example", url: "https://b.example/p", converted: 10, match: "uncertain" as const };
    expect(marketOf("p", "x", 36, [sure, lookalike], true)).toMatchObject({ median: 40, gap: -0.1, state: "compared" });
    expect(marketOf("p", "x", 36, [lookalike], true)).toMatchObject({ median: null, gap: null, state: "lookalikes_only" });
    expect(median([3, 1, 2, 10])).toBe(2.5);
  });

  it("drops the owner's own shop, social sites and a second page of one shop", () => {
    const hits = [
      { url: "https://mine.example/products/a", title: "", snippet: "" },
      { url: "https://www.instagram.com/p/1", title: "", snippet: "" },
      { url: "https://other.example/products/a", title: "", snippet: "" },
      { url: "https://other.example/products/b", title: "", snippet: "" },
    ];
    expect(candidateHits(hits, new Set(["mine.example"])).map((h) => h.url)).toEqual(["https://other.example/products/a"]);
  });
});
