import { getEnv } from "@/config/env";
import { salesPeriods } from "@/engine/store/periods";
import { summariseStore } from "@/engine/store/summary";
import { isLocalRequest } from "@/server/connector-config";
import { checkRateLimit } from "@/server/rate-limit";
import { readBrand } from "@/server/store/brand";
import { readInstagram } from "@/server/store/instagram";
import { readShopInfo, readStore } from "@/server/store/shopify";
import { readStripe } from "@/server/store/stripe";
import { readTraffic } from "@/server/store/traffic";
import { readStoreWeb } from "@/server/store/web";

/**
 * GET /api/store/:part — one source of "My store" at a time, so the page fills in as each arrives
 * and one slow or refused source never holds the others. Private: answered on this machine only.
 */

const STORE_PARTS = ["store", "traffic", "brand", "web", "instagram", "stripe"] as const;
type Part = (typeof STORE_PARTS)[number];
const isPart = (value: string): value is Part => (STORE_PARTS as readonly string[]).includes(value);

/** Each page load asks every part once: this leaves room for a few reloads, not for a loop. */
const LIMIT = { limit: 20, windowMs: 60_000 } as const;

const json = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, data, error: null }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function read(part: Part): Promise<unknown> {
  const env = getEnv();
  switch (part) {
    case "store": {
      const result = await readStore(env);
      if (!result.ok) return { result, summary: null, periods: null };
      const { snapshot } = result;
      return { result, summary: summariseStore(snapshot), periods: salesPeriods(snapshot.orders, Date.parse(snapshot.readAt), snapshot.ordersSince, !snapshot.ordersCapped) };
    }
    case "traffic":
      return readTraffic(env);
    case "instagram":
      return readInstagram(env);
    case "stripe":
      return readStripe(env);
    case "brand":
    case "web": {
      const shop = await readShopInfo(env);
      if (!shop.ok) return { ok: false, code: shop.code === "not_configured" ? "not_configured" : "unreachable" };
      return part === "brand" ? readBrand(shop.value.primaryUrl) : readStoreWeb(shop.value.primaryUrl, env);
    }
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ part: string }> }) {
  const part = (await params).part;
  if (!isPart(part)) return json({ ok: false, code: "not_found" }, 404);
  if (!(await isLocalRequest())) return json({ ok: false, code: "remote" }, 403);
  const limit = checkRateLimit(`store:part:${part}`, LIMIT.limit, LIMIT.windowMs);
  if (!limit.allowed) return json({ ok: false, code: "rate_limited" }, 429);
  try {
    return json(await read(part));
  } catch (error: unknown) {
    console.error(`[store/${part}] read failed`, error instanceof Error ? error.name : typeof error);
    return json({ ok: false, code: "api_error" }, 500);
  }
}
