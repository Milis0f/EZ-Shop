import { webResearchRequestSchema } from "@/domain/web";
import { apiError, apiErrorFrom, apiMessages, apiOk } from "@/server/api-response";
import { checkRateLimit } from "@/server/rate-limit";
import { checkJsonPost } from "@/server/request-guard";
import { GUARD_MESSAGE_KEY, requestLocale } from "@/server/request-locale";
import { runWebResearch } from "@/server/web/research";

const RATE_LIMIT = { key: "web:research", limit: 20, windowMs: 10 * 60_000 } as const;

/** POST /api/web/research — only runs when the visitor accepted the search. Body: `{ query }`. */
export async function POST(request: Request) {
  const locale = requestLocale(request);
  const m = apiMessages(locale);
  const guard = checkJsonPost(request.headers);
  if (!guard.ok) return apiError(guard.status, guard.code, m[GUARD_MESSAGE_KEY[guard.code]]);
  const limit = checkRateLimit(RATE_LIMIT.key, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (!limit.allowed) return apiError(429, "rate_limited", m.aiRateLimited, undefined, { "Retry-After": String(limit.retryAfterSeconds) });
  try {
    const body = webResearchRequestSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return apiError(400, "validation_error", m.invalidInput);
    return apiOk(await runWebResearch(body.data.query, locale));
  } catch (error: unknown) {
    return apiErrorFrom(error, locale);
  }
}
