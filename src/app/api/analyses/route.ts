import { apiError, apiErrorFrom, apiOk } from "@/server/api-response";
import { ANALYSIS_RATE_LIMIT, checkRateLimit } from "@/server/rate-limit";
import { createAnalysis, listRecentAnalyses } from "@/server/services";

/** GET /api/analyses — recent analyses (summaries). */
export async function GET() {
  try {
    return apiOk(await listRecentAnalyses(20));
  } catch (error: unknown) {
    return apiErrorFrom(error);
  }
}

/** POST /api/analyses — run a new analysis. Body: AnalysisInput (see src/domain/schemas.ts). */
export async function POST(request: Request) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = checkRateLimit(`analysis:${client}`, ANALYSIS_RATE_LIMIT.limit, ANALYSIS_RATE_LIMIT.windowMs);
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
