import "server-only";
import { z } from "zod";
import type { ServerEnv } from "@/config/env";
import { COUNTRIES, COUNTRY_CODES } from "@/domain/country";
import type { AdsDay, AdsFailure, AdsResult, AdsRow } from "@/domain/store";
import { describeMetaError } from "@/providers/meta-ad-library/adapter";
import { USER_AGENT } from "@/providers/http";

/**
 * Results of the owner's own ad accounts over the last 30 days: Meta (Marketing API, insights) and
 * Google Ads (the account already set up for Keyword Planner). Read-only, on request only: each call
 * spends the platform's API quota. Written from the official references, not yet run with real keys.
 */

const TIMEOUT_MS = 15_000;
export const DEFAULT_META_VERSION = "v26.0";
const PERIOD = "last_30d";

// ---------- Meta ----------

/** Meta's action types for each step, the first one found winning: the omni_ types already merge the others. */
const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"] as const;
const LANDING_TYPES = ["omni_landing_page_view", "landing_page_view"] as const;
const CART_TYPES = ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"] as const;
const CHECKOUT_TYPES = ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"] as const;

const actionList = z.array(z.object({ action_type: z.string(), value: z.union([z.string(), z.number()]) })).nullish();
const insightRow = z.object({
  spend: z.union([z.string(), z.number()]).nullish(),
  impressions: z.union([z.string(), z.number()]).nullish(),
  clicks: z.union([z.string(), z.number()]).nullish(),
  reach: z.union([z.string(), z.number()]).nullish(),
  inline_link_clicks: z.union([z.string(), z.number()]).nullish(),
  actions: actionList,
  action_values: actionList,
  account_currency: z.string().nullish(),
  country: z.string().nullish(),
  campaign_name: z.string().nullish(),
  date_start: z.string().nullish(),
});
const insightAnswer = z.object({ data: z.array(z.unknown()) });

const num = (value: string | number | null | undefined): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

function actionOf(list: z.infer<typeof actionList>, types: readonly string[]): number | null {
  for (const type of types) {
    const found = list?.find((action) => action.action_type === type);
    if (found) return num(found.value);
  }
  return null;
}

const optional = (value: string | number | null | undefined): number | null => (value === null || value === undefined ? null : num(value));

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** One row per day, in date order. */
function daysOf(rows: readonly AdsRow[]): AdsDay[] {
  return rows
    .filter((row) => DAY.test(row.label))
    .map((row) => ({ day: row.label, spend: row.spend, impressions: row.impressions, clicks: row.clicks, purchases: row.purchases }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function parseMetaInsights(raw: unknown, labelOf: (row: z.infer<typeof insightRow>) => string): { rows: AdsRow[]; currency: string | null } | null {
  const answer = insightAnswer.safeParse(raw);
  if (!answer.success) return null;
  let currency: string | null = null;
  const rows = answer.data.data.flatMap((item) => {
    const row = insightRow.safeParse(item);
    if (!row.success) return [];
    currency ??= row.data.account_currency ?? null;
    return [
      {
        label: labelOf(row.data),
        spend: num(row.data.spend),
        impressions: num(row.data.impressions),
        clicks: num(row.data.clicks),
        purchases: actionOf(row.data.actions, PURCHASE_TYPES),
        purchaseValue: actionOf(row.data.action_values, PURCHASE_TYPES),
        reach: optional(row.data.reach),
        linkClicks: optional(row.data.inline_link_clicks),
        landingViews: actionOf(row.data.actions, LANDING_TYPES),
        addToCart: actionOf(row.data.actions, CART_TYPES),
        checkouts: actionOf(row.data.actions, CHECKOUT_TYPES),
      },
    ];
  });
  return { rows: rows.sort((a, b) => b.spend - a.spend), currency };
}

/** Meta's daily rows, labelled by their `date_start`. */
export function parseMetaDays(raw: unknown): AdsDay[] | null {
  const parsed = parseMetaInsights(raw, (row) => row.date_start ?? "");
  return parsed ? daysOf(parsed.rows) : null;
}

/** Sums of the rows. Reach is left out: the same person can be reached in several rows. */
export function totalOf(rows: readonly AdsRow[], label: string): AdsRow {
  const sumOrNull = (pick: (row: AdsRow) => number | null | undefined) =>
    rows.some((row) => (pick(row) ?? null) !== null) ? rows.reduce((sum, row) => sum + (pick(row) ?? 0), 0) : null;
  return {
    label,
    spend: rows.reduce((sum, row) => sum + row.spend, 0),
    impressions: rows.reduce((sum, row) => sum + row.impressions, 0),
    clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
    purchases: sumOrNull((row) => row.purchases),
    purchaseValue: sumOrNull((row) => row.purchaseValue),
    linkClicks: sumOrNull((row) => row.linkClicks),
    landingViews: sumOrNull((row) => row.landingViews),
    addToCart: sumOrNull((row) => row.addToCart),
    checkouts: sumOrNull((row) => row.checkouts),
  };
}

export function metaAccountId(raw: string): string {
  return raw.trim().replace(/^act_/i, "");
}

export interface AdsDeps {
  readonly fetch: typeof fetch;
  readonly now?: () => number;
}

const DEFAULT_DEPS: AdsDeps = { fetch: (input, init) => fetch(input, init), now: () => Date.now() };
const nowOf = (deps: AdsDeps): number => deps.now?.() ?? Date.now();

function failureFor(status: number, body: string): AdsFailure {
  const described = describeMetaError(status, body);
  if (described?.code === "unauthorized" || status === 401 || status === 403) return "unauthorized";
  if (described?.code === "rate_limited" || status === 429) return "rate_limited";
  return "api_error";
}

async function metaGet(url: string, token: string, deps: AdsDeps): Promise<{ ok: true; body: unknown } | { ok: false; code: AdsFailure }> {
  let response: Response;
  try {
    // The token goes in a header, never in the address, which can end up in logs.
    response = await deps.fetch(url, { headers: { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    return { ok: false, code: "unreachable" };
  }
  const text = await response.text().catch(() => "");
  if (!response.ok) return { ok: false, code: failureFor(response.status, text) };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, code: "api_error" };
  }
}

export async function readMetaAds(env: ServerEnv, deps: AdsDeps = DEFAULT_DEPS): Promise<AdsResult> {
  if (!env.META_ADS_ACCESS_TOKEN || !env.META_AD_ACCOUNT_ID) return { ok: false, code: "not_configured" };
  const version = env.META_GRAPH_API_VERSION || DEFAULT_META_VERSION;
  const base = `https://graph.facebook.com/${version}/act_${encodeURIComponent(metaAccountId(env.META_AD_ACCOUNT_ID))}/insights`;
  const fields = "spend,impressions,clicks,inline_link_clicks,reach,actions,action_values,account_currency";
  const url = (params: Record<string, string>) => `${base}?${new URLSearchParams({ date_preset: PERIOD, ...params })}`;
  const token = env.META_ADS_ACCESS_TOKEN;
  const [whole, countries, campaigns, days] = await Promise.all([
    metaGet(url({ level: "account", fields }), token, deps),
    metaGet(url({ level: "account", breakdowns: "country", fields, limit: "250" }), token, deps),
    metaGet(url({ level: "campaign", fields: `${fields},campaign_name`, limit: "100" }), token, deps),
    metaGet(url({ level: "account", time_increment: "1", fields: "spend,impressions,clicks,actions,date_start", limit: "100" }), token, deps),
  ]);
  if (!whole.ok) return whole;
  if (!countries.ok) return countries;
  if (!campaigns.ok) return campaigns;
  if (!days.ok) return days;
  const total = parseMetaInsights(whole.body, () => "total");
  const byCountry = parseMetaInsights(countries.body, (row) => row.country ?? "?");
  const byCampaign = parseMetaInsights(campaigns.body, (row) => row.campaign_name ?? "?");
  const byDay = parseMetaDays(days.body);
  if (!total || !byCountry || !byCampaign || !byDay) return { ok: false, code: "api_error" };
  return {
    ok: true,
    report: {
      platform: "meta",
      currency: total.currency ?? byCountry.currency ?? byCampaign.currency,
      period: PERIOD,
      // No row at all means nothing was shown in the period: the sums of nothing.
      total: total.rows[0] ?? totalOf([], "total"),
      byCountry: byCountry.rows,
      campaigns: byCampaign.rows,
      byDay,
      readAt: new Date(nowOf(deps)).toISOString(),
    },
  };
}

// ---------- Google Ads ----------

const GOOGLE_REQUIRED = ["GOOGLE_ADS_API_VERSION", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"] as const;

const googleRow = z.object({
  segments: z.object({ date: z.string().nullish() }).nullish(),
  campaign: z.object({ name: z.string().nullish() }).nullish(),
  customer: z.object({ currencyCode: z.string().nullish() }).nullish(),
  geographicView: z.object({ countryCriterionId: z.union([z.string(), z.number()]).nullish() }).nullish(),
  metrics: z
    .object({
      costMicros: z.union([z.string(), z.number()]).nullish(),
      impressions: z.union([z.string(), z.number()]).nullish(),
      clicks: z.union([z.string(), z.number()]).nullish(),
      conversions: z.union([z.string(), z.number()]).nullish(),
      conversionsValue: z.union([z.string(), z.number()]).nullish(),
    })
    .nullish(),
});
const googleAnswer = z.object({ results: z.array(z.unknown()).default([]) });

/** Google's country criterion IDs are 2000 + ISO 3166-1 numeric: the countries the app knows get their code back. */
export function countryOfCriterion(id: string | number | null | undefined): string {
  const numeric = Number(id) - 2000;
  const code = COUNTRY_CODES.find((c) => COUNTRIES[c].isoNumeric === numeric);
  return code ?? `#${String(id ?? "?")}`;
}

export function parseGoogleRows(raw: unknown, labelOf: (row: z.infer<typeof googleRow>) => string): { rows: AdsRow[]; currency: string | null } | null {
  const answer = googleAnswer.safeParse(raw);
  if (!answer.success) return null;
  let currency: string | null = null;
  const merged = new Map<string, AdsRow>();
  for (const item of answer.data.results) {
    const row = googleRow.safeParse(item);
    if (!row.success) continue;
    currency ??= row.data.customer?.currencyCode ?? null;
    const m = row.data.metrics;
    const label = labelOf(row.data);
    const before = merged.get(label);
    // Several rows can share a label (one per location type): they add up.
    merged.set(label, {
      label,
      spend: (before?.spend ?? 0) + num(m?.costMicros) / 1_000_000,
      impressions: (before?.impressions ?? 0) + num(m?.impressions),
      clicks: (before?.clicks ?? 0) + num(m?.clicks),
      purchases: (before?.purchases ?? 0) + num(m?.conversions),
      purchaseValue: (before?.purchaseValue ?? 0) + num(m?.conversionsValue),
    });
  }
  return { rows: [...merged.values()].sort((a, b) => b.spend - a.spend), currency };
}

async function googleToken(env: ServerEnv, deps: AdsDeps): Promise<{ ok: true; token: string } | { ok: false; code: AdsFailure }> {
  try {
    const response = await deps.fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: env.GOOGLE_ADS_CLIENT_ID ?? "", client_secret: env.GOOGLE_ADS_CLIENT_SECRET ?? "", refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN ?? "" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as { access_token?: unknown };
    return response.ok && typeof body.access_token === "string" ? { ok: true, token: body.access_token } : { ok: false, code: "unauthorized" };
  } catch {
    return { ok: false, code: "unreachable" };
  }
}

async function googleSearch(env: ServerEnv, token: string, query: string, deps: AdsDeps): Promise<{ ok: true; body: unknown } | { ok: false; code: AdsFailure }> {
  const customerId = (env.GOOGLE_ADS_CUSTOMER_ID ?? "").replaceAll("-", "");
  const loginCustomerId = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replaceAll("-", "");
  let response: Response;
  try {
    response = await deps.fetch(`https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}) },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "unreachable" };
  }
  if (response.status === 401 || response.status === 403) return { ok: false, code: "unauthorized" };
  if (response.status === 429) return { ok: false, code: "rate_limited" };
  if (!response.ok) return { ok: false, code: "api_error" };
  const body = await response.json().catch(() => null);
  return body === null ? { ok: false, code: "api_error" } : { ok: true, body };
}

const METRICS = "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value";

/** Google's daily rows, labelled by their `segments.date`. */
export function parseGoogleDays(raw: unknown): AdsDay[] | null {
  const parsed = parseGoogleRows(raw, (row) => row.segments?.date ?? "");
  return parsed ? daysOf(parsed.rows) : null;
}

export async function readGoogleAds(env: ServerEnv, deps: AdsDeps = DEFAULT_DEPS): Promise<AdsResult> {
  if (GOOGLE_REQUIRED.some((key) => !env[key])) return { ok: false, code: "not_configured" };
  const token = await googleToken(env, deps);
  if (!token.ok) return token;
  const [campaigns, countries, days] = await Promise.all([
    googleSearch(env, token.token, `SELECT campaign.name, customer.currency_code, ${METRICS} FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'`, deps),
    googleSearch(env, token.token, `SELECT geographic_view.country_criterion_id, ${METRICS} FROM geographic_view WHERE segments.date DURING LAST_30_DAYS`, deps),
    googleSearch(env, token.token, `SELECT segments.date, ${METRICS} FROM customer WHERE segments.date DURING LAST_30_DAYS`, deps),
  ]);
  if (!campaigns.ok) return campaigns;
  if (!countries.ok) return countries;
  if (!days.ok) return days;
  const byCampaign = parseGoogleRows(campaigns.body, (row) => row.campaign?.name ?? "?");
  const byCountry = parseGoogleRows(countries.body, (row) => countryOfCriterion(row.geographicView?.countryCriterionId));
  const byDay = parseGoogleDays(days.body);
  if (!byCampaign || !byCountry || !byDay) return { ok: false, code: "api_error" };
  return {
    ok: true,
    report: {
      platform: "google",
      currency: byCampaign.currency,
      period: PERIOD,
      total: totalOf(byCampaign.rows, "total"),
      byCountry: byCountry.rows,
      campaigns: byCampaign.rows,
      byDay,
      readAt: new Date(nowOf(deps)).toISOString(),
    },
  };
}

const ADS_CACHE_MS = 10 * 60 * 1000;
const ADS_CACHE_KEY = Symbol.for("ez-shop.store-ads");
type KeptAds = Map<string, { readonly until: number; readonly result: AdsResult }>;
const globalForAds = globalThis as unknown as { [ADS_CACHE_KEY]?: KeptAds };

function adsCache(): KeptAds {
  globalForAds[ADS_CACHE_KEY] ??= new Map();
  return globalForAds[ADS_CACHE_KEY];
}

/** For tests: forget the kept reports. */
export function clearAdsCache(): void {
  adsCache().clear();
}

/**
 * A platform's report, kept ten minutes so the AI review and a second look do not spend the quota
 * again; `fresh` asks the platform anyway. Failures are not kept.
 */
export async function readAds(platform: "meta" | "google", env: ServerEnv, options: { readonly fresh?: boolean; readonly deps?: AdsDeps } = {}): Promise<AdsResult> {
  const deps = options.deps ?? DEFAULT_DEPS;
  const now = nowOf(deps);
  const kept = adsCache().get(platform);
  if (!options.fresh && kept && kept.until > now) return kept.result;
  const result = platform === "meta" ? await readMetaAds(env, deps) : await readGoogleAds(env, deps);
  if (result.ok) adsCache().set(platform, { until: now + ADS_CACHE_MS, result });
  return result;
}

export function adsConfigured(env: ServerEnv): { readonly meta: boolean; readonly google: boolean } {
  return { meta: Boolean(env.META_ADS_ACCESS_TOKEN && env.META_AD_ACCOUNT_ID), google: GOOGLE_REQUIRED.every((key) => Boolean(env[key])) };
}

/** A report already read in the last ten minutes, without asking the platform. */
export function keptAds(platform: "meta" | "google", now = Date.now()): AdsResult | null {
  const kept = adsCache().get(platform);
  return kept && kept.until > now ? kept.result : null;
}
