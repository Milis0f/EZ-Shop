import "server-only";
import { z } from "zod";
import type { ServerEnv } from "@/config/env";
import type { StoreTraffic, TrafficCounts, TrafficFailure, TrafficResult, TrafficSlice, TrafficSource } from "@/domain/store";
import { openShopify, type AskShopify, type ShopifyDeps } from "./shopify";

/**
 * Visits of the owner's online store over the last 30 days, from Shopify's own analytics (ShopifyQL,
 * `read_reports` scope). Robots are left out of every figure and counted apart. Read-only, and kept
 * five minutes so moving between tabs does not spend the store's analytics quota again.
 */

const PERIOD = "SINCE -30d UNTIL today";
const HUMANS = "WHERE human_or_bot_session = 'human'";
const COUNTS = "sessions, online_store_visitors, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout";
const CACHE_MS = 5 * 60 * 1000;
const PERIOD_DAYS = 30;

/** The queries, each checked against the store's ShopifyQL before being written here. */
export const TRAFFIC_QUERIES = {
  totals: `FROM sessions SHOW ${COUNTS}, pageviews, bounces, average_session_duration ${HUMANS} ${PERIOD}`,
  robots: `FROM sessions SHOW sessions GROUP BY human_or_bot_session ${PERIOD}`,
  days: `FROM sessions SHOW ${COUNTS} ${HUMANS} TIMESERIES day ${PERIOD} ORDER BY day ASC`,
  countries: `FROM sessions SHOW ${COUNTS} ${HUMANS} GROUP BY session_country_code ${PERIOD} ORDER BY sessions DESC LIMIT 30`,
  sources: `FROM sessions SHOW ${COUNTS} ${HUMANS} GROUP BY traffic_type, referrer_name ${PERIOD} ORDER BY sessions DESC LIMIT 30`,
  devices: `FROM sessions SHOW ${COUNTS} ${HUMANS} GROUP BY session_device_type ${PERIOD} ORDER BY sessions DESC LIMIT 8`,
  landing: `FROM sessions SHOW ${COUNTS} ${HUMANS} GROUP BY landing_page_path ${PERIOD} ORDER BY sessions DESC LIMIT 10`,
} as const;

type QueryName = keyof typeof TRAFFIC_QUERIES;
type Row = Readonly<Record<string, unknown>>;

const SHOPIFYQL = `query Traffic($query: String!) {
  shopifyqlQuery(query: $query) { tableData { columns { name } rows } parseErrors }
}`;

const answerSchema = z.object({
  tableData: z.object({ rows: z.array(z.record(z.string(), z.unknown())) }).nullish(),
  parseErrors: z.array(z.unknown()).nullish(),
});

const errorSchema = z.array(z.object({ message: z.string().optional(), extensions: z.object({ code: z.string().optional() }).optional() }));

/** Why Shopify refused a query, from its error code and wording only. */
export function trafficFailureOf(errors: unknown): TrafficFailure {
  const parsed = errorSchema.safeParse(errors);
  if (!parsed.success) return "api_error";
  for (const error of parsed.data) {
    const message = error.message ?? "";
    const code = error.extensions?.code ?? "";
    if (code === "THROTTLED" || /throttl|rate limit/i.test(message)) return "rate_limited";
    if (/protected customer data|customer data/i.test(message)) return "customer_data";
    if (code === "ACCESS_DENIED" || /read_reports|access denied|scope/i.test(message)) return "missing_scope";
  }
  return "api_error";
}

/** The rows of a ShopifyQL answer, or why there are none. An empty grouped answer is no rows, not an error. */
export function parseShopifyqlAnswer(data: unknown, errors: unknown): { ok: true; rows: Row[] } | { ok: false; code: TrafficFailure } {
  const answer = answerSchema.safeParse((data as { shopifyqlQuery?: unknown } | undefined)?.shopifyqlQuery);
  if (!answer.success || !answer.data.tableData) return { ok: false, code: errors ? trafficFailureOf(errors) : "api_error" };
  if ((answer.data.parseErrors ?? []).length > 0) return { ok: false, code: "api_error" };
  return { ok: true, rows: answer.data.tableData.rows };
}

const count = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export function countsOf(row: Row | undefined): TrafficCounts {
  return {
    sessions: count(row?.sessions),
    visitors: count(row?.online_store_visitors),
    carts: count(row?.sessions_with_cart_additions),
    checkouts: count(row?.sessions_that_reached_checkout),
    purchases: count(row?.sessions_that_completed_checkout),
  };
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

function slices(rows: readonly Row[], column: string): TrafficSlice[] {
  return rows.map((row) => ({ key: text(row[column]) ?? "?", ...countsOf(row) })).filter((slice) => slice.sessions > 0);
}

/** Puts the answers together; robots are counted from their own group, the rest are human visits only. */
export function assembleTraffic(rows: Readonly<Record<QueryName, readonly Row[]>>, now: Date): StoreTraffic {
  const total = rows.totals[0];
  const duration = Number(total?.average_session_duration);
  const totals = { ...countsOf(total), pageviews: count(total?.pageviews), bounces: count(total?.bounces) };
  const days = rows.days.flatMap((row) => {
    const day = text(row.day);
    return day && /^\d{4}-\d{2}-\d{2}/.test(day) ? [{ day: day.slice(0, 10), ...countsOf(row) }] : [];
  });
  const fallbackSince = new Date(now.getTime() - PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sources: TrafficSource[] = rows.sources
    .map((row) => ({ type: text(row.traffic_type)?.toLowerCase() ?? "unknown", name: text(row.referrer_name), ...countsOf(row) }))
    .filter((source) => source.sessions > 0);
  return {
    since: days[0]?.day ?? fallbackSince,
    until: days.at(-1)?.day ?? now.toISOString().slice(0, 10),
    totals: { ...totals, averageSeconds: totals.sessions > 0 && Number.isFinite(duration) ? duration : null },
    botSessions: rows.robots.filter((row) => text(row.human_or_bot_session)?.toLowerCase() === "bot").reduce((sum, row) => sum + count(row.sessions), 0),
    byDay: days,
    byCountry: slices(rows.countries, "session_country_code").map((slice) => ({ ...slice, key: slice.key.toUpperCase() })),
    bySource: sources,
    byDevice: slices(rows.devices, "session_device_type").map((slice) => ({ ...slice, key: slice.key.toLowerCase() })),
    byLanding: slices(rows.landing, "landing_page_path"),
    readAt: now.toISOString(),
  };
}

async function run(ask: AskShopify, name: QueryName): Promise<{ ok: true; rows: Row[] } | { ok: false; code: TrafficFailure }> {
  const answer = await ask(SHOPIFYQL, { query: TRAFFIC_QUERIES[name] });
  if (!answer.ok) return answer;
  return parseShopifyqlAnswer(answer.value.data, answer.value.errors);
}

const CACHE_KEY = Symbol.for("ez-shop.store-traffic");
const globalForTraffic = globalThis as unknown as { [CACHE_KEY]?: Map<string, { readonly until: number; readonly result: TrafficResult }> };

function cache(): Map<string, { readonly until: number; readonly result: TrafficResult }> {
  globalForTraffic[CACHE_KEY] ??= new Map();
  return globalForTraffic[CACHE_KEY];
}

/** For tests: forget the kept answers. */
export function clearTrafficCache(): void {
  cache().clear();
}

const DEFAULT_DEPS: ShopifyDeps = { fetch: (input, init) => fetch(input, init), now: () => Date.now() };

/** The store's visits over the last 30 days, kept five minutes. */
export async function readTraffic(env: ServerEnv, deps: ShopifyDeps = DEFAULT_DEPS): Promise<TrafficResult> {
  const opened = await openShopify(env, deps);
  if (!opened.ok) return opened;
  const now = deps.now();
  const kept = cache().get(opened.value.domain);
  if (kept && kept.until > now) return kept.result;

  const names = Object.keys(TRAFFIC_QUERIES) as QueryName[];
  const answers = await Promise.all(names.map((name) => run(opened.value.ask, name)));
  const failed = answers.find((answer) => !answer.ok);
  if (failed && !failed.ok) return { ok: false, code: failed.code };
  const rows = Object.fromEntries(names.map((name, i) => [name, (answers[i] as { rows: Row[] }).rows])) as Record<QueryName, Row[]>;
  const result: TrafficResult = { ok: true, traffic: assembleTraffic(rows, new Date(now)) };
  cache().set(opened.value.domain, { until: now + CACHE_MS, result });
  return result;
}
