import { INTL_LOCALES, type Locale } from "@/i18n/config";

/** A country's name in the interface language, for any ISO code a store can ship to. */
export function regionName(code: string | null, locale: Locale, unknown: string): string {
  if (!code) return unknown;
  try {
    return new Intl.DisplayNames([INTL_LOCALES[locale]], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** "2026-10" as a short month and year in the interface language. */
export function monthName(month: string, locale: Locale): string {
  const [year, index] = month.split("-").map(Number);
  if (!year || !index) return month;
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(year, index - 1, 1)));
}

/** A list of names cut after a few, so a sentence stays readable. */
export function shortList(items: readonly string[], max = 6): string {
  return items.length > max ? `${items.slice(0, max).join(", ")}…` : items.join(", ");
}
