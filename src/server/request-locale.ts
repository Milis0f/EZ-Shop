import "server-only";

import { LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { resolveLocale } from "@/i18n/negotiate";

/** Value of one cookie in a `Cookie` header, or undefined. */
function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

/**
 * Locale of an API request, by the same rules as pages (ez-locale cookie, then Accept-Language, then
 * English), read from the request itself so route handlers need no request-scoped `cookies()`.
 */
export function requestLocale(request: Request): Locale {
  return resolveLocale({
    cookie: cookieValue(request.headers.get("cookie"), LOCALE_COOKIE),
    acceptLanguage: request.headers.get("accept-language"),
  });
}

/** API message key of a request-guard refusal. */
export const GUARD_MESSAGE_KEY = {
  unsupported_media_type: "unsupportedMediaType",
  forbidden_origin: "forbiddenOrigin",
} as const;
