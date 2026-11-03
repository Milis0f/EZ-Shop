import { deepResearchRequestSchema } from "@/domain/deep-research";
import { apiError, apiMessages, apiOk } from "@/server/api-response";
import { enqueueDeepResearch } from "@/server/jobs";
import { checkRateLimit } from "@/server/rate-limit";
import { checkJsonPost } from "@/server/request-guard";
import { GUARD_MESSAGE_KEY, requestLocale } from "@/server/request-locale";

/** One research fills the local AI for minutes: a few an hour is plenty. */
const RATE_LIMIT = { key: "research:deep", limit: 6, windowMs: 60 * 60_000 } as const;

/**
 * POST /api/research/deep — queues the deep AI research and answers at once with its id (202). The
 * background worker runs it; the page follows it with GET /api/runs/:id and can leave meanwhile.
 */
export async function POST(request: Request) {
  const locale = requestLocale(request);
  const m = apiMessages(locale);
  const guard = checkJsonPost(request.headers);
  if (!guard.ok) return apiError(guard.status, guard.code, m[GUARD_MESSAGE_KEY[guard.code]]);
  const body = deepResearchRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError(400, "validation_error", m.invalidInput);
  const limit = checkRateLimit(RATE_LIMIT.key, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (!limit.allowed) return apiError(429, "rate_limited", m.aiRateLimited, undefined, { "Retry-After": String(limit.retryAfterSeconds) });

  const id = await enqueueDeepResearch(body.data, locale);
  if (!id) return apiError(503, "database_unavailable", m.databaseDamaged);
  return apiOk({ id }, 202);
}
