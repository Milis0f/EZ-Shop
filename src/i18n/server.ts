import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";
import { LOCALE_COOKIE, type Locale } from "./config";
import { messagesFor, type Area, type Messages } from "./messages";
import { resolveLocale } from "./negotiate";

/**
 * The active locale for this request: the ez-locale cookie, then Accept-Language, then English.
 * Reads request data, so under Cache Components it must run inside a <Suspense> boundary (or in a
 * component already below one, which is every page: the root layout wraps them in one).
 * Deduplicated per request with React cache().
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
});

/** The strings of one area in the active locale. Pass `locale` when already known to skip the lookup. */
export async function getMessages<A extends Area>(area: A, locale?: Locale): Promise<Messages<A>> {
  return messagesFor(area, locale ?? (await getLocale()));
}
