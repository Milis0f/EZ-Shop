import "server-only";
import { z } from "zod";
import type { ServerEnv } from "@/config/env";
import type { StripeDay, StripeFailure, StripeReport, StripeResult } from "@/domain/store";
import { USER_AGENT } from "@/providers/http";

/**
 * The owner's Stripe account, read with a restricted key (rk_…) that can only read: balance and
 * charges of the last 60 days. A full secret key (sk_…) is refused when it is saved: read access is
 * all this needs. Docs: docs.stripe.com/api/charges/list, docs.stripe.com/keys/restricted-api-keys
 * (checked 2026-11-05). Kept five minutes.
 */

const API = "https://api.stripe.com/v1";
const TIMEOUT_MS = 15_000;
const CACHE_MS = 5 * 60 * 1000;
const DAYS = 60;
const HALF = 30;
const PAGE = 100;
const MAX_PAGES = 10;
const DAY_MS = 86_400_000;

/** Currencies Stripe counts in whole units (docs.stripe.com/currencies#zero-decimal). */
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
export const toMajor = (amount: number, currency: string): number => (ZERO_DECIMAL.has(currency.toLowerCase()) ? amount : amount / 100);

/** A restricted key, live or test; a secret key is refused. */
export const isRestrictedKey = (key: string): boolean => /^rk_(live|test)_[A-Za-z0-9]{10,}$/.test(key.trim());

export interface StripeDeps {
  readonly fetch: typeof fetch;
  readonly now: () => number;
}

const DEFAULT_DEPS: StripeDeps = { fetch: (input, init) => fetch(input, init), now: () => Date.now() };

/** Stripe's error type and code only. */
export function stripeFailureOf(status: number, body: string): StripeFailure {
  let type: unknown;
  try {
    type = (JSON.parse(body) as { error?: { type?: unknown } }).error?.type;
  } catch {
    type = undefined;
  }
  if (status === 401) return "unauthorized";
  // A restricted key without the needed read permission answers 403 (permission_error) or 400.
  if (status === 403 || type === "permission_error") return "missing_permission";
  if (status === 429 || type === "rate_limit_error") return "rate_limited";
  return "api_error";
}

async function get(path: string, params: URLSearchParams, key: string, deps: StripeDeps): Promise<{ ok: true; body: unknown } | { ok: false; code: StripeFailure }> {
  let response: Response;
  try {
    response = await deps.fetch(`${API}/${path}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${key}`, "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "unreachable" };
  }
  const text = await response.text().catch(() => "");
  if (!response.ok) return { ok: false, code: stripeFailureOf(response.status, text) };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, code: "api_error" };
  }
}

const moneySchema = z.array(z.object({ amount: z.number(), currency: z.string() }));
const balanceSchema = z.object({ available: moneySchema, pending: moneySchema });

const chargeSchema = z.object({
  id: z.string(),
  amount: z.number(),
  amount_refunded: z.number().default(0),
  currency: z.string(),
  created: z.number(),
  status: z.string(),
  paid: z.boolean().default(false),
  disputed: z.boolean().default(false),
  payment_method_details: z
    .object({ type: z.string().nullish(), card: z.object({ brand: z.string().nullish(), country: z.string().nullish(), wallet: z.object({ type: z.string().nullish() }).nullish() }).nullish() })
    .nullish(),
});
export type StripeCharge = z.infer<typeof chargeSchema>;
const listSchema = z.object({ data: z.array(z.unknown()), has_more: z.boolean() });

const empty = () => ({ gross: 0, refunded: 0, payments: 0, failed: 0, disputed: 0 });
const top = (counts: Map<string, number>) => [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, payments]) => ({ key, payments }));

/** Sums the charges of the account currency; payments in other currencies are counted apart. */
export function assembleStripe(charges: readonly StripeCharge[], balance: z.infer<typeof balanceSchema> | null, nowMs: number, capped: boolean): StripeReport {
  const currency = (balance?.available[0]?.currency ?? charges[0]?.currency ?? "eur").toLowerCase();
  const end = Date.UTC(new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), new Date(nowMs).getUTCDate());
  const days = Array.from({ length: HALF }, (_, i) => new Date(end - (HALF - 1 - i) * DAY_MS).toISOString().slice(0, 10));
  const byDay = new Map<string, StripeDay>(days.map((day) => [day, { day, gross: 0, refunded: 0, payments: 0 }]));
  const current = empty();
  const previous = empty();
  const methods = new Map<string, number>();
  const countries = new Map<string, number>();
  let otherCurrencies = 0;
  const splitAt = end - (HALF - 1) * DAY_MS;
  for (const charge of charges) {
    if (charge.currency.toLowerCase() !== currency) {
      otherCurrencies += 1;
      continue;
    }
    const at = charge.created * 1000;
    const bucket = at >= splitAt ? current : previous;
    if (charge.status !== "succeeded" || !charge.paid) {
      if (charge.status === "failed") bucket.failed += 1;
      continue;
    }
    const gross = toMajor(charge.amount, currency);
    const refunded = toMajor(charge.amount_refunded, currency);
    bucket.gross += gross;
    bucket.refunded += refunded;
    bucket.payments += 1;
    if (charge.disputed) bucket.disputed += 1;
    if (bucket === current) {
      const day = byDay.get(new Date(at).toISOString().slice(0, 10));
      if (day) byDay.set(day.day, { ...day, gross: day.gross + gross, refunded: day.refunded + refunded, payments: day.payments + 1 });
      const card = charge.payment_method_details?.card;
      const method = card?.wallet?.type ?? card?.brand ?? charge.payment_method_details?.type ?? "other";
      methods.set(method, (methods.get(method) ?? 0) + 1);
      if (card?.country) countries.set(card.country.toUpperCase(), (countries.get(card.country.toUpperCase()) ?? 0) + 1);
    }
  }
  const round = (o: ReturnType<typeof empty>) => ({ ...o, gross: Math.round(o.gross * 100) / 100, refunded: Math.round(o.refunded * 100) / 100 });
  const sumOf = (list: z.infer<typeof moneySchema> | undefined) => {
    const row = list?.filter((m) => m.currency.toLowerCase() === currency);
    return row && row.length ? toMajor(row.reduce((s, m) => s + m.amount, 0), currency) : null;
  };
  return {
    currency: currency.toUpperCase(),
    since: new Date(end - (DAYS - 1) * DAY_MS).toISOString().slice(0, 10),
    current: round(current),
    previous: round(previous),
    byDay: [...byDay.values()].map((d) => ({ ...d, gross: Math.round(d.gross * 100) / 100, refunded: Math.round(d.refunded * 100) / 100 })),
    methods: top(methods),
    countries: top(countries),
    available: sumOf(balance?.available),
    pending: sumOf(balance?.pending),
    capped,
    otherCurrencies,
    readAt: new Date(nowMs).toISOString(),
  };
}

const CACHE_KEY = Symbol.for("ez-shop.store-stripe");
const globalForStripe = globalThis as unknown as { [CACHE_KEY]?: { until: number; result: StripeResult } };

/** For tests: forget the kept answer. */
export function clearStripeCache(): void {
  delete globalForStripe[CACHE_KEY];
}

export async function readStripe(env: ServerEnv, deps: StripeDeps = DEFAULT_DEPS): Promise<StripeResult> {
  const key = env.STRIPE_API_KEY?.trim();
  if (!key) return { ok: false, code: "not_configured" };
  if (!isRestrictedKey(key)) return { ok: false, code: "unauthorized" };
  const now = deps.now();
  const kept = globalForStripe[CACHE_KEY];
  if (kept && kept.until > now) return kept.result;

  const balanceAnswer = await get("balance", new URLSearchParams(), key, deps);
  // Balance read is optional: a key limited to charges still shows the payments.
  if (!balanceAnswer.ok && balanceAnswer.code !== "missing_permission") return balanceAnswer;
  const balance = balanceAnswer.ok ? (balanceSchema.safeParse(balanceAnswer.body).data ?? null) : null;

  const charges: StripeCharge[] = [];
  let after: string | null = null;
  let capped = false;
  const since = Math.floor((now - DAYS * DAY_MS) / 1000);
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ limit: String(PAGE), "created[gte]": String(since) });
    if (after) params.set("starting_after", after);
    const answer = await get("charges", params, key, deps);
    if (!answer.ok) return answer;
    const list = listSchema.safeParse(answer.body);
    if (!list.success) return { ok: false, code: "api_error" };
    const parsed = list.data.data.flatMap((raw) => {
      const charge = chargeSchema.safeParse(raw);
      return charge.success ? [charge.data] : [];
    });
    charges.push(...parsed);
    if (!list.data.has_more || parsed.length === 0) break;
    after = parsed.at(-1)?.id ?? null;
    if (page === MAX_PAGES - 1) capped = true;
  }
  const result: StripeResult = { ok: true, report: assembleStripe(charges, balance, now, capped) };
  globalForStripe[CACHE_KEY] = { until: now + CACHE_MS, result };
  return result;
}
