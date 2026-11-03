import { NextResponse } from "next/server";
import { getEnv } from "@/config/env";
import { isLoopbackHost } from "@/server/local-access";
import { EZ_SHOP_GOOGLE_PUBLIC_CLIENT_ID, startSignIn } from "@/server/oauth/google";

/**
 * GET /api/oauth/google/start — sends the browser to Google's consent page for the Google Ads scope.
 * The person's own client ID when they gave one, else the project's public one (none yet).
 */
export async function GET(request: Request) {
  const host = request.headers.get("host") ?? "";
  if (!isLoopbackHost(host)) return new NextResponse("This computer only.", { status: 403 });
  const back = `http://${host}/connectors`;
  const clientId = getEnv().GOOGLE_ADS_CLIENT_ID ?? (EZ_SHOP_GOOGLE_PUBLIC_CLIENT_ID || undefined);
  if (!clientId) return NextResponse.redirect(`${back}?oauth=missing_client#google-ads-keyword-planner`, 303);
  const port = host.includes("]:") ? host.split("]:")[1] : (host.split(":")[1] ?? "80");
  return NextResponse.redirect(startSignIn({ clientId, port, returnTo: `http://${host}` }), 303);
}
