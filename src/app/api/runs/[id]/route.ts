import { isRunOver, parseRunStep, type RunView } from "@/domain/history";
import { apiError, apiErrorFrom, apiMessages } from "@/server/api-response";
import { getRun } from "@/server/history";
import { requestLocale } from "@/server/request-locale";

/** GET /api/runs/:id — where a run is (polled by the page), and its report once it is over. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = requestLocale(request);
  try {
    const run = await getRun((await params).id);
    if (!run) return apiError(404, "not_found", apiMessages(locale).invalidInput);
    const view: RunView = {
      id: run.id,
      kind: run.kind,
      title: run.title,
      status: run.status,
      progress: run.progress,
      step: parseRunStep(run.step),
      error: run.error,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
      ...(isRunOver(run.status) && run.result !== null && { result: run.result }),
    };
    return new Response(JSON.stringify({ success: true, data: view, error: null }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (error: unknown) {
    return apiErrorFrom(error, locale);
  }
}
