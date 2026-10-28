import { apiError, apiErrorFrom, apiMessages, apiOk } from "@/server/api-response";
import { ANALYSIS_RATE_LIMIT, checkRateLimit } from "@/server/rate-limit";
import { checkJsonPost } from "@/server/request-guard";
import { GUARD_MESSAGE_KEY, requestLocale } from "@/server/request-locale";
import { createAnalysis, listRecentAnalyses } from "@/server/services";

/** GET /api/analyses — recent analyses (summaries). */
export async function GET(request: Request) {
  try {
    return apiOk(await listRecentAnalyses(20));
  } catch (error: unknown) {
    return apiErrorFrom(error, requestLocale(request));
  }
}

/**
 * One rate-limit bucket for the whole API. The client address is deliberately not part of the key:
 * `X-Forwarded-For` is client-controlled, so keying on it lets anyone dodge the limit. Per-client
 * limits need a trusted proxy, which belongs to the deployment project.
 */
const RATE_LIMIT_KEY = "analysis:api";

/**
 * POST /api/analyses — run a new analysis. Body: AnalysisInput (see src/domain/schemas.ts).
 * Order matters: request guard, then rate limit, then body.
 */
export async function POST(request: Request) {
  const locale = requestLocale(request);
  const m = apiMessages(locale);
  const guard = checkJsonPost(request.headers);
  if (!guard.ok) return apiError(guard.status, guard.code, m[GUARD_MESSAGE_KEY[guard.code]]);

  const limit = checkRateLimit(RATE_LIMIT_KEY, ANALYSIS_RATE_LIMIT.limit, ANALYSIS_RATE_LIMIT.windowMs);
  if (!limit.allowed) {
    return apiError(429, "rate_limited", m.analysisRateLimited, undefined, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid_json", m.invalidJson);
  }

  try {
    const result = await createAnalysis(body);
    return apiOk({ id: result.id, status: result.status }, 201);
  } catch (error: unknown) {
    return apiErrorFrom(error, locale);
  }
}
