import { NextResponse, type NextRequest } from "next/server";
import { checkLocalAccess } from "@/server/local-access";

/**
 * Every request, pages, API routes, Server Actions and static files alike, must be addressed to this
 * computer (see src/server/local-access.ts). No matcher on purpose: nothing is served to anyone else.
 * The settings, connector and store actions check it again themselves.
 */
export function proxy(request: NextRequest): NextResponse {
  const access = checkLocalAccess(request.headers, request.method);
  if (access.ok) return NextResponse.next();
  return new NextResponse("EZ-Shop ne répond que sur cet ordinateur : ouvre http://localhost.\nEZ-Shop only answers on this computer: open http://localhost.\n", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
