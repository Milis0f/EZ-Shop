import {
  AI_INSIGHT_RATE_LIMIT,
  AI_REQUEST_RATE_LIMIT,
  GenerationRateLimitedError,
  getAnalysisInsight,
  type GenerationAdmission,
} from "@/server/ai/insight";
import { apiError, apiErrorFrom, apiMessages, apiOk } from "@/server/api-response";
import type { Locale } from "@/i18n/config";
import { checkRateLimit } from "@/server/rate-limit";
import { checkJsonPost } from "@/server/request-guard";
import { GUARD_MESSAGE_KEY, requestLocale } from "@/server/request-locale";
import { getAnalysis } from "@/server/services";

/**
 * Buckets for the whole endpoint, like `POST /api/analyses`: the client address is not trusted.
 * Every request counts against the first. Only a generation that really reaches the model counts
 * against the second: a cached reading, a disabled AI, a missing model or a sheet too long answer
 * without touching the GPU, while a new reading keeps it busy for up to a minute or two.
 */
const REQUEST_RATE_LIMIT_KEY = "analysis:ai";
const GENERATION_RATE_LIMIT_KEY = "analysis:ai:generate";

function tooManyRequests(retryAfterSeconds: number, locale: Locale): Response {
  return apiError(429, "rate_limited", apiMessages(locale).aiRateLimited, undefined, {
    "Retry-After": String(retryAfterSeconds),
  });
}

function admitGeneration(): GenerationAdmission {
  const generation = checkRateLimit(GENERATION_RATE_LIMIT_KEY, AI_INSIGHT_RATE_LIMIT.limit, AI_INSIGHT_RATE_LIMIT.windowMs);
  return generation.allowed ? { allowed: true } : { allowed: false, retryAfterSeconds: generation.retryAfterSeconds };
}

/**
 * POST /api/analyses/:id/ai — local AI reading of a stored analysis (no body needed).
 * Answers `{ status: "ready" | "unavailable" | "rejected" }` inside the usual envelope.
 * Order matters: request guard, then the request rate limit, then the analysis, then (only right
 * before the model runs) the generation limit.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = requestLocale(request);
  const m = apiMessages(locale);
  const guard = checkJsonPost(request.headers);
  if (!guard.ok) return apiError(guard.status, guard.code, m[GUARD_MESSAGE_KEY[guard.code]]);

  const limit = checkRateLimit(REQUEST_RATE_LIMIT_KEY, AI_REQUEST_RATE_LIMIT.limit, AI_REQUEST_RATE_LIMIT.windowMs);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds, locale);

  try {
    const { id } = await params;
    const analysis = await getAnalysis(id);
    if (!analysis) return apiError(404, "not_found", m.notFound);
    return apiOk(await getAnalysisInsight(analysis, { admitGeneration }));
  } catch (error: unknown) {
    if (error instanceof GenerationRateLimitedError) return tooManyRequests(error.retryAfterSeconds, locale);
    return apiErrorFrom(error, locale);
  }
}
