/** Interface languages. Order matters: it is the order of the language switcher. */
export const LOCALES = ["en", "fr", "es"] as const;

export type Locale = (typeof LOCALES)[number];

/** English is the primary language: used when no cookie and no accepted language matches. */
export const DEFAULT_LOCALE: Locale = "en";

/** Cookie holding the visitor's explicit choice (set by the language switcher). */
export const LOCALE_COOKIE = "ez-locale";

/** One year, in seconds. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Name of each language in that language, as shown in the switcher. */
export const LOCALE_LABELS: Readonly<Record<Locale, string>> = {
  en: "English",
  fr: "Français",
  es: "Español",
};

/** Short code shown on the switcher pill. */
export const LOCALE_SHORT_LABELS: Readonly<Record<Locale, string>> = { en: "EN", fr: "FR", es: "ES" };

/**
 * BCP 47 tags handed to Intl (numbers, currencies, dates) and used for <html lang>.
 * English uses en-GB rather than en-US: the audience is mostly European e-commerce sellers, so
 * day-month-year dates, 24-hour times and euro amounts read naturally (en-US would print 10/28/2026
 * and 3:00 PM). Digit grouping and the decimal point are the same in both.
 */
export const INTL_LOCALES: Readonly<Record<Locale, string>> = {
  en: "en-GB",
  fr: "fr-FR",
  es: "es-ES",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
