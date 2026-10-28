import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

/**
 * Supported locales from an Accept-Language header, best first ("fr-CH,fr;q=0.9,en;q=0.8" -> fr, en).
 * Region subtags are dropped; entries with q=0 or a malformed q are ignored.
 */
export function parseAcceptLanguage(header: string | null | undefined): Locale[] {
  if (!header) return [];
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const q = qParam === undefined ? 1 : Number(qParam.slice(2));
      return { base: tag.trim().toLowerCase().split("-")[0] ?? "", q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  const result: Locale[] = [];
  for (const { base } of ranked) {
    if (isLocale(base) && !result.includes(base)) result.push(base);
  }
  return result;
}

/** Resolution order: the explicit cookie choice, then the browser's accepted languages, then English. */
export function resolveLocale(input: { cookie?: string | null; acceptLanguage?: string | null }): Locale {
  if (isLocale(input.cookie)) return input.cookie;
  return parseAcceptLanguage(input.acceptLanguage)[0] ?? DEFAULT_LOCALE;
}
