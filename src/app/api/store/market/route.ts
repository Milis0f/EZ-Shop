import { getEnv } from "@/config/env";
import { isLocalRequest } from "@/server/connector-config";
import { checkRateLimit } from "@/server/rate-limit";
import { requestLocale } from "@/server/request-locale";
import { readStoreMarket } from "@/server/store/market";
import { readStore } from "@/server/store/shopify";

/**
 * POST /api/store/market — the store's best products next to the same products elsewhere. Asked on
 * purpose (a button): it searches the web and reads other shops' pages, which takes a minute.
 */

const LIMIT = { limit: 2, windowMs: 5 * 60_000 } as const;
const json = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, data, error: null }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function POST(request: Request) {
  if (!(await isLocalRequest())) return json({ ok: false, code: "remote" }, 403);
  const limit = checkRateLimit("store:market", LIMIT.limit, LIMIT.windowMs);
  if (!limit.allowed) return json({ ok: false, code: "rate_limited" }, 429);
  try {
    const env = getEnv();
    const store = await readStore(env);
    if (!store.ok) return json({ ok: false, code: "no_store" });
    return json(await readStoreMarket(store.snapshot, env, requestLocale(request)));
  } catch (error: unknown) {
    console.error("[store/market] failed", error instanceof Error ? error.name : typeof error);
    return json({ ok: false, code: "search_failed" }, 500);
  }
}
