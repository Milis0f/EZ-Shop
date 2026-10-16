import { connection } from "next/server";
import { apiErrorFrom, apiOk } from "@/server/api-response";
import { getConnectorOverview } from "@/server/services";

/** GET /api/connectors — configuration state of every data source (never exposes secrets). */
export async function GET() {
  // Environment-dependent: must reflect runtime configuration, never a build-time snapshot.
  await connection();
  try {
    const { connectors, mockAllowed } = await getConnectorOverview();
    return apiOk({
      mockAllowed,
      connectors: connectors.map(({ meta, status }) => ({
        id: meta.id,
        name: meta.name,
        category: meta.category,
        access: meta.access,
        verification: meta.verification,
        state: status.state,
        detail: status.detail,
        requiredEnv: meta.requiredEnv,
        docsUrl: meta.docsUrl,
      })),
    });
  } catch (error: unknown) {
    return apiErrorFrom(error);
  }
}
