import { INTL_LOCALES, type Locale } from "./config";

/**
 * Locale-aware display formatting. Every function takes the active locale explicitly, so the same
 * helpers work in Server Components (getLocale()) and Client Components (useLocale()).
 * French output is byte-for-byte what the app printed before i18n (see src/lib/format.test.ts).
 */

const cache = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: Locale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = cache.get(key);
  if (!format) {
    format = new Intl.NumberFormat(INTL_LOCALES[locale], options);
    cache.set(key, format);
  }
  return format;
}

/** Any number with Intl options, in the locale's digits and separators. */
export const formatNumber = (v: number, locale: Locale, options: Intl.NumberFormatOptions = {}): string =>
  numberFormat(locale, options).format(v);

export const formatInt = (v: number, locale: Locale): string => formatNumber(v, locale, { maximumFractionDigits: 0 });

export const formatDecimal = (v: number, locale: Locale): string => formatNumber(v, locale, { maximumFractionDigits: 1 });

/** Compact for large values, one decimal below 10 so small estimates are not rounded to zero. */
export function formatCompact(v: number, locale: Locale): string {
  if (Math.abs(v) >= 10_000) return formatNumber(v, locale, { notation: "compact", maximumFractionDigits: 1 });
  return Math.abs(v) < 10 ? formatDecimal(v, locale) : formatInt(v, locale);
}

/** French and Spanish typography put a space before %, English does not. */
export const PERCENT_SUFFIX: Readonly<Record<Locale, string>> = { en: "%", fr: " %", es: " %" };

/** A value already in percent (12.5 -> "12.5%"). `signed` adds "+" to positive values. */
export const formatPct = (v: number, locale: Locale, options: { signed?: boolean } = {}): string =>
  `${options.signed && v > 0 ? "+" : ""}${formatDecimal(v, locale)}${PERCENT_SUFFIX[locale]}`;

/** A ratio (0.125 -> "12.5%"). */
export const formatRatioPct = (v: number, locale: Locale): string => formatPct(v * 100, locale);

/** Currency amount: cents below 10, whole units above. */
export function formatMoney(v: number, locale: Locale, currency = "EUR"): string {
  const digits = Math.abs(v) < 10 ? 2 : 0;
  return formatNumber(v, locale, { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** ISO timestamp as a medium date and a short time. */
export const formatDate = (iso: string, locale: Locale): string =>
  new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

/**
 * One end of a stored period ("2025", "2025-10" or "2025-10-24") as a date in the locale.
 * Anything else is returned as stored.
 */
export function formatPeriodEnd(value: string, locale: Locale): string {
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  if (!month) return year ?? value;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, day ? Number(day) : 1));
  const options: Intl.DateTimeFormatOptions = day ? { dateStyle: "medium", timeZone: "UTC" } : { month: "short", year: "numeric", timeZone: "UTC" };
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], options).format(date);
}

/** The helpers above bound to one locale (returned by useFormat() on the client). */
export function createFormatters(locale: Locale) {
  return {
    locale,
    number: (v: number, options?: Intl.NumberFormatOptions) => formatNumber(v, locale, options),
    int: (v: number) => formatInt(v, locale),
    decimal: (v: number) => formatDecimal(v, locale),
    compact: (v: number) => formatCompact(v, locale),
    pct: (v: number, options?: { signed?: boolean }) => formatPct(v, locale, options),
    ratioPct: (v: number) => formatRatioPct(v, locale),
    money: (v: number, currency?: string) => formatMoney(v, locale, currency),
    date: (iso: string) => formatDate(iso, locale),
  } as const;
}

export type Formatters = ReturnType<typeof createFormatters>;
