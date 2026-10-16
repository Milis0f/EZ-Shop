import { apiError, apiErrorFrom, apiOk } from "@/server/api-response";
import { ANALYSIS_RATE_LIMIT, checkRateLimit } from "@/server/rate-limit";
import { checkJsonPost } from "@/server/request-guard";
import { createAnalysis, listRecentAnalyses } from "@/server/services";

/** GET /api/analyses — recent analyses (summaries). */
export async function GET() {
  try {
    return apiOk(await listRecentAnalyses(20));
  } catch (error: unknown) {
    return apiErrorFrom(error);
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
  const guard = checkJsonPost(request.headers);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);

  const limit = checkRateLimit(RATE_LIMIT_KEY, ANALYSIS_RATE_LIMIT.limit, ANALYSIS_RATE_LIMIT.windowMs);
  if (!limit.allowed) {
    return apiError(429, "rate_limited", "Trop d'analyses, réessaie plus tard.", undefined, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Corps JSON invalide.");
  }

  try {
    const result = await createAnalysis(body);
    return apiOk({ id: result.id, status: result.status }, 201);
  } catch (error: unknown) {
    return apiErrorFrom(error);
  }
}
