import type { AiInsight } from "@/domain/ai-insight";
import { getCountry, type CountryCode } from "@/domain/country";
import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "@/i18n/config";

/** Countries that got word for word the same sentence, written once (the first country's order). */
export interface CountryLineGroup {
  readonly countries: readonly CountryCode[];
  readonly sentence: string;
}

/** Groups shown before « Voir les autres pays »; the rest sits behind an expand. */
export const VISIBLE_COUNTRY_GROUPS = 3;

const spanishNames = new Intl.DisplayNames(INTL_LOCALES.es, { type: "region" });

/** Country name in the interface language (French and English from the country table, Spanish from Intl). */
export function countryName(code: CountryCode, locale: Locale): string {
  const country = getCountry(code);
  if (locale === "fr") return country.nameFr;
  if (locale === "es") return spanishNames.of(code) ?? country.nameEn;
  return country.nameEn;
}

const sentenceKey = (sentence: string, locale: Locale): string =>
  sentence.trim().replace(/\s+/g, " ").toLocaleLowerCase(INTL_LOCALES[locale]);

/** Lines with the same sentence (spacing and case aside) become one line listing every country. */
export function groupCountryLines(lines: AiInsight["countries"], locale: Locale = DEFAULT_LOCALE): CountryLineGroup[] {
  const groups = new Map<string, { countries: CountryCode[]; sentence: string }>();
  for (const line of lines) {
    const key = sentenceKey(line.sentence, locale);
    const group = groups.get(key);
    if (group) group.countries.push(line.country);
    else groups.set(key, { countries: [line.country], sentence: line.sentence.trim() });
  }
  return [...groups.values()];
}

/** Lowercases the first letter after a colon, unless the word is an acronym (« LED », « USB »). */
export function lowerFirst(text: string, locale: Locale = DEFAULT_LOCALE): string {
  const tag = INTL_LOCALES[locale];
  const [first = "", second = ""] = text;
  return second && second === second.toLocaleUpperCase(tag) && /\p{L}/u.test(second) ? text : `${first.toLocaleLowerCase(tag)}${text.slice(1)}`;
}
