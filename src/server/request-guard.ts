import "server-only";

/**
 * Guard for state-changing JSON endpoints (`POST /api/analyses`).
 *
 * Server Actions are origin-checked by Next.js; route handlers are not. Without this check a page
 * on another site can start analyses from a visitor's browser with a `text/plain` POST, which
 * needs no CORS preflight. The rules follow the Server Actions check, with one deliberate
 * difference: `X-Forwarded-Host` is never trusted. No trusted proxy is configured, so any client
 * could send it. The `Origin` host is compared with the `Host` header only.
 *
 * This is NOT authentication. A request without an `Origin` header (curl, a local script, any
 * program on the machine) is accepted, and DNS rebinding passes an `Origin` = `Host` comparison.
 * Authentication and per-client limits belong to the deployment project.
 */

export type GuardResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly status: 403 | 415;
      /** The route words it in the request's locale (server messages, `api.*`). */
      readonly code: "forbidden_origin" | "unsupported_media_type";
    };

const ALLOWED: GuardResult = { ok: true };

const UNSUPPORTED_MEDIA_TYPE: GuardResult = {
  ok: false,
  status: 415,
  code: "unsupported_media_type",
};

const FORBIDDEN_ORIGIN: GuardResult = {
  ok: false,
  status: 403,
  code: "forbidden_origin",
};

function mediaType(headers: Headers): string {
  return (headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * Host (`name[:port]`, lower case) of an `Origin` header that is exactly `<scheme>//<host>` with
 * an http(s) scheme. Anything else (`null`, a path, query, fragment, user info, a list of values,
 * a non-URL) returns `undefined` so it can never be matched leniently against `Host`.
 */
function exactOriginHost(origin: string): string | undefined {
  if (origin.includes(",")) return undefined;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  // `url.origin` is the canonical `<scheme>//<host>`; any difference means extra parts were given.
  return url.origin === origin.toLowerCase() ? url.host : undefined;
}

/** Accepts only `application/json` bodies sent by a page of the same origin (or by no browser page at all). */
export function checkJsonPost(headers: Headers): GuardResult {
  if (mediaType(headers) !== "application/json") return UNSUPPORTED_MEDIA_TYPE;

  const origin = headers.get("origin");
  if (origin === null) return ALLOWED;

  const originHost = exactOriginHost(origin);
  const host = headers.get("host")?.trim().toLowerCase();
  if (originHost === undefined || !host || originHost !== host) return FORBIDDEN_ORIGIN;
  return ALLOWED;
}
