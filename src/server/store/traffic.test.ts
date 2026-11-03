import { afterEach, describe, expect, it } from "vitest";
import type { ServerEnv } from "@/config/env";
import { clearShopifyTokens } from "./shopify";
import { assembleTraffic, clearTrafficCache, parseShopifyqlAnswer, readTraffic, TRAFFIC_QUERIES, trafficFailureOf } from "./traffic";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const NOW = Date.parse("2026-11-02T12:00:00Z");
const env = { SHOPIFY_STORE_DOMAIN: "test.myshopify.com", SHOPIFY_CLIENT_ID: "id", SHOPIFY_CLIENT_SECRET: "secret" } as unknown as ServerEnv;

afterEach(() => {
  clearShopifyTokens();
  clearTrafficCache();
});

const table = (rows: Record<string, unknown>[]) => ({ shopifyqlQuery: { tableData: { columns: [], rows }, parseErrors: [] } });

describe("ShopifyQL answers", () => {
  it("reads the rows, and an empty grouped answer as no rows", () => {
    expect(parseShopifyqlAnswer(table([{ sessions: "23" }]), undefined)).toEqual({ ok: true, rows: [{ sessions: "23" }] });
    expect(parseShopifyqlAnswer(table([]), undefined)).toEqual({ ok: true, rows: [] });
  });

  it("refuses a query Shopify could not parse", () => {
    expect(parseShopifyqlAnswer({ shopifyqlQuery: { tableData: null, parseErrors: ["Unknown field"] } }, undefined)).toEqual({ ok: false, code: "api_error" });
  });

  it("names the missing permission, the customer data access and the throttling", () => {
    expect(trafficFailureOf([{ message: "Access denied for shopifyqlQuery field. Required access: `read_reports` access scope.", extensions: { code: "ACCESS_DENIED" } }])).toBe("missing_scope");
    expect(trafficFailureOf([{ message: "This app is not approved to access protected customer data." }])).toBe("customer_data");
    expect(trafficFailureOf([{ message: "Throttled", extensions: { code: "THROTTLED" } }])).toBe("rate_limited");
    expect(trafficFailureOf("nonsense")).toBe("api_error");
    expect(parseShopifyqlAnswer({ shopifyqlQuery: null }, [{ message: "x", extensions: { code: "ACCESS_DENIED" } }])).toEqual({ ok: false, code: "missing_scope" });
  });

  it("only keeps human visits in its queries and counts robots apart", () => {
    for (const [name, query] of Object.entries(TRAFFIC_QUERIES)) {
      if (name === "robots") expect(query).toContain("GROUP BY human_or_bot_session");
      else expect(query).toContain("WHERE human_or_bot_session = 'human'");
      expect(query).toContain("SINCE -30d UNTIL today");
    }
  });
});

describe("assembling the visits", () => {
  const empty = { totals: [], robots: [], days: [], countries: [], sources: [], devices: [], landing: [] };

  it("turns Shopify's strings into numbers, robots apart, the period from the days", () => {
    const traffic = assembleTraffic(
      {
        ...empty,
        totals: [{ sessions: "40", online_store_visitors: "30", sessions_with_cart_additions: "6", sessions_that_reached_checkout: "3", sessions_that_completed_checkout: "2", pageviews: "90", bounces: "12", average_session_duration: "61.5" }],
        robots: [
          { human_or_bot_session: "bot", sessions: "23" },
          { human_or_bot_session: "human", sessions: "40" },
        ],
        days: [
          { day: "2026-10-03", sessions: "0", online_store_visitors: "0" },
          { day: "2026-11-02", sessions: "40", online_store_visitors: "30", sessions_with_cart_additions: "6", sessions_that_completed_checkout: "2" },
        ],
        countries: [{ session_country_code: "fr", sessions: "30" }, { session_country_code: "US", sessions: "0" }],
        sources: [{ traffic_type: "Paid", referrer_name: "Facebook", sessions: "10", sessions_that_completed_checkout: "1" }, { traffic_type: "direct", referrer_name: null, sessions: "30" }],
        devices: [{ session_device_type: "Mobile", sessions: "25" }],
        landing: [{ landing_page_path: "/", sessions: "22" }],
      },
      new Date(NOW),
    );
    expect(traffic.totals).toEqual({ sessions: 40, visitors: 30, carts: 6, checkouts: 3, purchases: 2, pageviews: 90, bounces: 12, averageSeconds: 61.5 });
    expect(traffic.botSessions).toBe(23);
    expect(traffic.since).toBe("2026-10-03");
    expect(traffic.until).toBe("2026-11-02");
    expect(traffic.byCountry).toEqual([{ key: "FR", sessions: 30, visitors: 0, carts: 0, checkouts: 0, purchases: 0 }]);
    expect(traffic.bySource[0]).toMatchObject({ type: "paid", name: "Facebook", sessions: 10, purchases: 1 });
    expect(traffic.bySource[1]).toMatchObject({ type: "direct", name: null });
    expect(traffic.byDevice[0]?.key).toBe("mobile");
  });

  it("has no average visit length without visits", () => {
    const traffic = assembleTraffic({ ...empty, totals: [{ sessions: "0", average_session_duration: null }] }, new Date(NOW));
    expect(traffic.totals.averageSeconds).toBeNull();
    expect(traffic.since).toBe("2026-10-03");
  });
});

describe("reading the visits", () => {
  function store(answer: (query: string) => unknown) {
    const calls: string[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/admin/oauth/access_token")) return json({ access_token: "token", expires_in: 86_399 });
      const body = JSON.parse(String(init?.body)) as { variables: { query: string } };
      calls.push(body.variables.query);
      return json(answer(body.variables.query));
    };
    return { calls, deps: { fetch: fetch as typeof globalThis.fetch, now: () => NOW } };
  }

  it("runs every query once, then keeps the answer five minutes", async () => {
    const { calls, deps } = store(() => ({ data: table([{ sessions: "1" }]) }));
    const first = await readTraffic(env, deps);
    expect(first.ok).toBe(true);
    expect(calls).toHaveLength(Object.keys(TRAFFIC_QUERIES).length);
    await readTraffic(env, deps);
    expect(calls).toHaveLength(Object.keys(TRAFFIC_QUERIES).length);
  });

  it("reports the first refusal and keeps nothing", async () => {
    const { deps } = store(() => ({ data: { shopifyqlQuery: null }, errors: [{ message: "Access denied", extensions: { code: "ACCESS_DENIED" } }] }));
    expect(await readTraffic(env, deps)).toEqual({ ok: false, code: "missing_scope" });
  });

  it("says when the store is not connected", async () => {
    expect(await readTraffic({} as ServerEnv)).toEqual({ ok: false, code: "not_configured" });
  });
});
