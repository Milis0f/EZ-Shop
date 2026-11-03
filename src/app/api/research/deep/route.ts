import { deepResearchRequestSchema, type DeepEvent } from "@/domain/deep-research";
import { apiError, apiMessages } from "@/server/api-response";
import { checkRateLimit } from "@/server/rate-limit";
import { checkJsonPost } from "@/server/request-guard";
import { GUARD_MESSAGE_KEY, requestLocale } from "@/server/request-locale";
import { finishRun, startRun } from "@/server/history";
import { runDeepResearch } from "@/server/research/deep-research";

/** One research fills the local AI for minutes: a few an hour is plenty. */
const RATE_LIMIT = { key: "research:deep", limit: 6, windowMs: 60 * 60_000 } as const;

/**
 * POST /api/research/deep — runs the deep AI research and streams it as JSON lines: each step as it
 * starts, then the report (or why there is none). Closing the request stops the research.
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: DeepEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The visitor left: the research stops through the request's signal.
        }
      };
      // Kept in the history from the start: a research cut by a stop shows as interrupted, not lost.
      const runId = await startRun({ kind: "deep_research", title: body.data.product, locale, countries: [body.data.country], params: body.data });
      let outcome: DeepEvent | null = null;
      const track = (event: DeepEvent) => {
        if (event.type === "report" || event.type === "failed") outcome = event;
        emit(event);
      };
      try {
        await runDeepResearch(body.data, locale, track, {}, request.signal);
      } catch (error: unknown) {
        console.error("[deep] research failed", error instanceof Error ? error.name : typeof error);
        track({ type: "failed", code: "search_failed" });
      } finally {
        const ended = outcome as DeepEvent | null;
        if (ended?.type === "report") {
          const { report } = ended;
          await finishRun(runId, { status: "completed", result: report, sourceCount: report.sources.length, model: report.model, durationMs: report.durationMs });
          if (runId) emit({ type: "saved", id: runId });
        } else {
          await finishRun(runId, ended?.type === "failed" ? { status: "failed", error: ended.code } : { status: request.signal.aborted ? "cancelled" : "failed", error: "no_report" });
        }
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
