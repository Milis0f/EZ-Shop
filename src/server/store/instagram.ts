import "server-only";
import { z } from "zod";
import type { ServerEnv } from "@/config/env";
import type { InstagramFailure, InstagramPost, InstagramReport, InstagramResult } from "@/domain/store";
import { USER_AGENT } from "@/providers/http";
import { DEFAULT_META_VERSION } from "./ads";

/**
 * The owner's Instagram professional account, through the Instagram API with Facebook Login and the
 * owner's own Meta token (the one of "My store" ads). Read-only: the account, 28 days of insights
 * and the last posts. Docs: developers.facebook.com/docs/instagram-platform (checked 2026-11-05).
 * Permissions needed on the token: instagram_basic, instagram_manage_insights, pages_show_list,
 * pages_read_engagement. Kept five minutes.
 */

const TIMEOUT_MS = 15_000;
const CACHE_MS = 5 * 60 * 1000;
/** Instagram's insights accept at most 30 days per call: 28 stays clear of the limit and of a partial day. */
const DAYS = 28;
const POSTS = 12;
const DAY_MS = 86_400_000;
const TOTAL_METRICS = ["views", "reach", "accounts_engaged", "total_interactions", "profile_links_taps"] as const;

type Get = (path: string, params: Record<string, string>) => Promise<{ ok: true; body: unknown } | { ok: false; code: InstagramFailure }>;

export interface InstagramDeps {
  readonly fetch: typeof fetch;
  readonly now: () => number;
}

const DEFAULT_DEPS: InstagramDeps = { fetch: (input, init) => fetch(input, init), now: () => Date.now() };

/** Meta's error code only: the body could echo what was sent. */
export function instagramFailureOf(status: number, body: string): InstagramFailure {
  let code: unknown;
  try {
    code = (JSON.parse(body) as { error?: { code?: unknown } }).error?.code;
  } catch {
    code = undefined;
  }
  if (code === 190 || code === 102 || status === 401) return "unauthorized";
  if (code === 10 || code === 200 || code === 3 || (typeof code === "number" && code >= 200 && code < 300)) return "missing_permission";
  if (code === 4 || code === 17 || code === 32 || code === 613 || status === 429) return "rate_limited";
  if (status === 403) return "missing_permission";
  return "api_error";
}

function getter(env: ServerEnv, deps: InstagramDeps): Get {
  const version = env.META_GRAPH_API_VERSION || DEFAULT_META_VERSION;
  const token = env.META_ADS_ACCESS_TOKEN ?? "";
  return async (path, params) => {
    let response: Response;
    try {
      // The token goes in a header, never in the address.
      response = await deps.fetch(`https://graph.facebook.com/${version}/${path}?${new URLSearchParams(params).toString()}`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      return { ok: false, code: "unreachable" };
    }
    const text = await response.text().catch(() => "");
    if (!response.ok) return { ok: false, code: instagramFailureOf(response.status, text) };
    try {
      return { ok: true, body: JSON.parse(text) };
    } catch {
      return { ok: false, code: "api_error" };
    }
  };
}

const accountSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string().nullish(),
  profile_picture_url: z.string().nullish(),
  followers_count: z.number().nullish(),
  media_count: z.number().nullish(),
});
type Account = z.infer<typeof accountSchema>;

const pagesSchema = z.object({ data: z.array(z.object({ instagram_business_account: accountSchema.nullish() })) });

/** The first Page of the token that has an Instagram professional account linked. */
export function accountOfPages(body: unknown): Account | null {
  const parsed = pagesSchema.safeParse(body);
  if (!parsed.success) return null;
  return parsed.data.data.find((page) => page.instagram_business_account)?.instagram_business_account ?? null;
}

const insightsSchema = z.object({
  data: z.array(
    z.object({
      name: z.string(),
      values: z.array(z.object({ value: z.unknown(), end_time: z.string().optional() })).optional(),
      total_value: z.object({ value: z.number().nullish() }).nullish(),
    }),
  ),
});

export function reachSeries(body: unknown): InstagramReport["reachByDay"] {
  const parsed = insightsSchema.safeParse(body);
  const reach = parsed.success ? parsed.data.data.find((m) => m.name === "reach") : undefined;
  return (reach?.values ?? []).flatMap((v) => {
    const value = typeof v.value === "number" ? v.value : null;
    // end_time is the end of the day measured: the day before it, in UTC.
    const day = v.end_time ? new Date(Date.parse(v.end_time) - 1).toISOString().slice(0, 10) : null;
    return value !== null && day ? [{ day, value }] : [];
  });
}

export function totalsOf(body: unknown): InstagramReport["totals"] {
  const parsed = insightsSchema.safeParse(body);
  const pick = (name: string): number | null => {
    const value = parsed.success ? parsed.data.data.find((m) => m.name === name)?.total_value?.value : null;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  return { views: pick("views"), reach: pick("reach"), accountsEngaged: pick("accounts_engaged"), interactions: pick("total_interactions"), linkTaps: pick("profile_links_taps") };
}

const mediaSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      caption: z.string().nullish(),
      media_type: z.string().nullish(),
      media_product_type: z.string().nullish(),
      timestamp: z.string(),
      permalink: z.string().nullish(),
      thumbnail_url: z.string().nullish(),
      media_url: z.string().nullish(),
      like_count: z.number().nullish(),
      comments_count: z.number().nullish(),
    }),
  ),
});

const httpsOnly = (raw: string | null | undefined): string | null => (raw && /^https:\/\//i.test(raw) ? raw : null);

export function postsOf(body: unknown): InstagramPost[] {
  const parsed = mediaSchema.safeParse(body);
  if (!parsed.success) return [];
  return parsed.data.data.map((m) => ({
    id: m.id,
    type: m.media_product_type === "REELS" ? "REELS" : (m.media_type ?? "IMAGE"),
    caption: m.caption ? m.caption.slice(0, 140) : null,
    postedAt: m.timestamp,
    permalink: httpsOnly(m.permalink),
    // A video's own file is not an image: its cover is.
    thumbnail: httpsOnly(m.media_type === "VIDEO" ? m.thumbnail_url : (m.media_url ?? m.thumbnail_url)),
    likes: m.like_count ?? null,
    comments: m.comments_count ?? null,
  }));
}

const CACHE_KEY = Symbol.for("ez-shop.store-instagram");
const globalForInstagram = globalThis as unknown as { [CACHE_KEY]?: { until: number; result: InstagramResult } };

/** For tests: forget the kept answer. */
export function clearInstagramCache(): void {
  delete globalForInstagram[CACHE_KEY];
}

const ACCOUNT_FIELDS = "id,username,name,profile_picture_url,followers_count,media_count";

export async function readInstagram(env: ServerEnv, deps: InstagramDeps = DEFAULT_DEPS): Promise<InstagramResult> {
  if (!env.META_ADS_ACCESS_TOKEN) return { ok: false, code: "not_configured" };
  const now = deps.now();
  const kept = globalForInstagram[CACHE_KEY];
  if (kept && kept.until > now) return kept.result;
  const get = getter(env, deps);

  const pages = await get("me/accounts", { fields: `instagram_business_account{${ACCOUNT_FIELDS}}`, limit: "25" });
  if (!pages.ok) return pages;
  const account = accountOfPages(pages.body);
  if (!account) return { ok: false, code: "no_account" };

  const until = Math.floor(now / 1000);
  const since = Math.floor((now - DAYS * DAY_MS) / 1000);
  const range = { since: String(since), until: String(until), period: "day" };
  const [series, totals, media] = await Promise.all([
    get(`${account.id}/insights`, { ...range, metric: "reach", metric_type: "time_series" }),
    get(`${account.id}/insights`, { ...range, metric: TOTAL_METRICS.join(","), metric_type: "total_value" }),
    get(`${account.id}/media`, { fields: "id,caption,media_type,media_product_type,timestamp,permalink,thumbnail_url,media_url,like_count,comments_count", limit: String(POSTS) }),
  ]);
  // Insights need instagram_manage_insights: without it, the account and its posts are still worth showing.
  const refused = [series, totals, media].find((answer) => !answer.ok && answer.code !== "missing_permission");
  if (refused && !refused.ok) return refused;

  const report: InstagramReport = {
    username: account.username,
    name: account.name ?? null,
    picture: httpsOnly(account.profile_picture_url),
    followers: account.followers_count ?? null,
    posts: account.media_count ?? null,
    since: new Date(since * 1000).toISOString().slice(0, 10),
    until: new Date(until * 1000).toISOString().slice(0, 10),
    reachByDay: series.ok ? reachSeries(series.body) : [],
    totals: totals.ok ? totalsOf(totals.body) : { views: null, reach: null, accountsEngaged: null, interactions: null, linkTaps: null },
    recent: media.ok ? postsOf(media.body) : [],
    readAt: new Date(now).toISOString(),
  };
  const result: InstagramResult = { ok: true, report };
  globalForInstagram[CACHE_KEY] = { until: now + CACHE_MS, result };
  return result;
}
