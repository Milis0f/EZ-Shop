import { apiError, apiErrorFrom, apiOk } from "@/server/api-response";
import { getAnalysis } from "@/server/services";

/** GET /api/analyses/:id — full analysis with provenance of every value. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const analysis = await getAnalysis(id);
    return analysis ? apiOk(analysis) : apiError(404, "not_found", "Analyse introuvable.");
  } catch (error: unknown) {
    return apiErrorFrom(error);
  }
}
