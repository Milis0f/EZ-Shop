"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "./config";
import { createFormatters, type Formatters } from "./format";
import { messagesFor, type Area, type Messages } from "./messages";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * Hands the request locale (resolved on the server by getLocale()) to Client Components.
 * Mounted once in the root layout; also keeps <html lang> in step after a language switch.
 */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = INTL_LOCALES[locale];
  }, [locale]);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** The strings of one area in the active locale. Dictionaries are static imports: no loading state. */
export function useMessages<A extends Area>(area: A): Messages<A> {
  return messagesFor(area, useLocale());
}

/** Number, money and date helpers bound to the active locale. */
export function useFormat(): Formatters {
  const locale = useLocale();
  return useMemo(() => createFormatters(locale), [locale]);
}
