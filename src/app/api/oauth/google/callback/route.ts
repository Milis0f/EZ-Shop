import { NextResponse } from "next/server";
import { getEnv } from "@/config/env";
import { isLoopbackHost } from "@/server/local-access";
import { exchangeCode, takePending } from "@/server/oauth/google";
import { saveSettings } from "@/server/secrets/settings-store";

/**
 * GET /api/oauth/google/callback — Google sends the browser back here with a code. The state must be
 * one this server issued, once and recently (a forged or replayed callback is refused); the code is
 * traded with the PKCE verifier, and the refresh token is saved to the system's credential store.
 * The browser then returns to the Sources page, which says what happened.
 */
export async function GET(request: Request) {
  const host = request.headers.get("host") ?? "";
  if (!isLoopbackHost(host)) return new NextResponse("This computer only.", { status: 403 });
  const url = new URL(request.url);
  const entry = takePending(url.searchParams.get("state"));
  const back = (result: string) => NextResponse.redirect(`${entry?.returnTo ?? `http://${host}`}/connectors?oauth=${result}#google-ads-keyword-planner`, 303);
  if (!entry) return back("refused");
  if (url.searchParams.get("error")) return back("denied");
  const code = url.searchParams.get("code");
  if (!code) return back("refused");

  const env = getEnv();
  // The person's secret goes with their own client only; a public client needs none.
  const secret = entry.clientId === env.GOOGLE_ADS_CLIENT_ID ? env.GOOGLE_ADS_CLIENT_SECRET : undefined;
  const exchanged = await exchangeCode(code, entry, secret);
  if (!exchanged.ok) return back(exchanged.code);
  try {
    await saveSettings([{ key: "GOOGLE_ADS_REFRESH_TOKEN", value: exchanged.refreshToken }], "Google Ads API — Keyword Planning");
  } catch (error: unknown) {
    console.error("[oauth] refresh token not saved", error instanceof Error ? error.name : typeof error);
    return back("save_failed");
  }
  return back("connected");
}
