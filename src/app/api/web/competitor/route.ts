import { competitorRequestSchema } from "@/domain/web";
import { apiError, apiErrorFrom, apiMessages, apiOk } from "@/server/api-response";
import { checkRateLimit } from "@/server/rate-limit";
import { checkJsonPost } from "@/server/request-guard";
import { GUARD_MESSAGE_KEY, requestLocale } from "@/server/request-locale";
import { recordRun } from "@/server/history";
import { analyzeCompetitor } from "@/server/web/competitor";

const RATE_LIMIT = { key: "web:competitor", limit: 30, windowMs: 10 * 60_000 } as const;

/** POST /api/web/competitor — reads a competitor in depth. Body: `{ url, searchSupplier, deep }`. */
export async function POST(request: Request) {
  const locale = requestLocale(request);
  const m = apiMessages(locale);
  const guard = checkJsonPost(request.headers);
  if (!guard.ok) return apiError(guard.status, guard.code, m[GUARD_MESSAGE_KEY[guard.code]]);
  const limit = checkRateLimit(RATE_LIMIT.key, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (!limit.allowed) return apiError(429, "rate_limited", m.aiRateLimited, undefined, { "Retry-After": String(limit.retryAfterSeconds) });
  try {
    const body = competitorRequestSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return apiError(400, "validation_error", m.invalidInput);
    const result = await analyzeCompetitor(body.data.url, { searchSupplier: body.data.searchSupplier, deep: body.data.deep }, locale);
    await recordRun(
      { kind: "competitor", title: result.status === "ready" ? result.domain : body.data.url, locale, countries: [], params: body.data },
      result.status === "ready" ? { status: "completed", result, sourceCount: result.sources.length, durationMs: result.durationMs } : { status: "failed", error: result.code },
    );
    return apiOk(result);
  } catch (error: unknown) {
    return apiErrorFrom(error, locale);
  }
}
