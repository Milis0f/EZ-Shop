import { apiError, apiErrorFrom, apiMessages, apiOk } from "@/server/api-response";
import { jobWorker } from "@/server/jobs";
import { checkJsonPost } from "@/server/request-guard";
import { GUARD_MESSAGE_KEY, requestLocale } from "@/server/request-locale";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/runs/:id/cancel — stops a run: at once when it waits, at its next step when it runs. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = requestLocale(request);
  const m = apiMessages(locale);
  const guard = checkJsonPost(request.headers);
  if (!guard.ok) return apiError(guard.status, guard.code, m[GUARD_MESSAGE_KEY[guard.code]]);
  const { id } = await params;
  if (!UUID.test(id)) return apiError(400, "validation_error", m.invalidInput);
  try {
    return apiOk({ cancelled: await jobWorker().cancel(id) });
  } catch (error: unknown) {
    return apiErrorFrom(error, locale);
  }
}
