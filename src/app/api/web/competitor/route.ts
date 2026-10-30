import { competitorRequestSchema } from "@/domain/web";
import { apiError, apiErrorFrom, apiMessages, apiOk } from "@/server/api-response";
import { checkRateLimit } from "@/server/rate-limit";
import { checkJsonPost } from "@/server/request-guard";
import { GUARD_MESSAGE_KEY, requestLocale } from "@/server/request-locale";
import { analyzeCompetitor } from "@/server/web/competitor";

const RATE_LIMIT = { key: "web:competitor", limit: 30, windowMs: 10 * 60_000 } as const;

/** POST /api/web/competitor — reads one public product page. Body: `{ url, searchSupplier }`. */
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
    return apiOk(await analyzeCompetitor(body.data.url, body.data.searchSupplier, locale));
  } catch (error: unknown) {
    return apiErrorFrom(error, locale);
  }
}
