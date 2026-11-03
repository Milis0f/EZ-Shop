/**
 * EZ-Shop serves the person at this computer only. Every request must be addressed to this machine by
 * name (`Host`: localhost, *.localhost, 127.0.0.0/8 or [::1]), so that:
 * - a site that points its own name at 127.0.0.1 (DNS rebinding) gets nothing: its `Host` is its name;
 * - another device of the network gets nothing either, even if the server was started on 0.0.0.0.
 * A request that changes something and comes from a browser page must also come from this very origin
 * (same host and port): another local app on another port cannot drive EZ-Shop.
 *
 * This is NOT authentication. A program running on this computer is trusted: it can read the files anyway.
 * No `server-only` import: `src/proxy.ts` runs this outside the React Server Components graph.
 */

export type LocalAccess = { readonly ok: true } | { readonly ok: false; readonly reason: "host" | "forwarded_host" | "origin" };

const ALLOWED: LocalAccess = { ok: true };
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** localhost, *.localhost, 127.0.0.0/8 and ::1, with or without a port. */
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  const name = h.startsWith("[") ? h.slice(1, h.indexOf("]")) : h.split(":")[0];
  return name === "localhost" || name.endsWith(".localhost") || name === "::1" || /^127(?:\.\d{1,3}){3}$/.test(name);
}

/** Host (`name[:port]`) of an `Origin` that is exactly `<scheme>//<host>`; undefined for "null" or anything else. */
function originHost(origin: string): string | undefined {
  try {
    const url = new URL(origin);
    return url.origin === origin.trim().toLowerCase() ? url.host : undefined;
  } catch {
    return undefined;
  }
}

export function checkLocalAccess(headers: Headers, method: string): LocalAccess {
  const host = headers.get("host")?.trim().toLowerCase() ?? "";
  if (!isLoopbackHost(host)) return { ok: false, reason: "host" };

  // Next.js trusts X-Forwarded-Host over Host for its own Server Action origin check.
  const forwarded = headers.get("x-forwarded-host");
  if (forwarded !== null && !forwarded.split(",").every((h) => isLoopbackHost(h))) return { ok: false, reason: "forwarded_host" };

  if (SAFE_METHODS.has(method.toUpperCase())) return ALLOWED;
  const origin = headers.get("origin");
  // No Origin: not a browser page (curl, a script on this machine).
  if (origin === null) return ALLOWED;
  return originHost(origin) === host ? ALLOWED : { ok: false, reason: "origin" };
}
