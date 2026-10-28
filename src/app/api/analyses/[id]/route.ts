import { apiError, apiErrorFrom, apiMessages, apiOk } from "@/server/api-response";
import { requestLocale } from "@/server/request-locale";
import { getAnalysis } from "@/server/services";

/** GET /api/analyses/:id — full analysis with provenance of every value. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = requestLocale(request);
  try {
    const { id } = await params;
    const analysis = await getAnalysis(id);
    return analysis ? apiOk(analysis) : apiError(404, "not_found", apiMessages(locale).notFound);
  } catch (error: unknown) {
    return apiErrorFrom(error, locale);
  }
}
