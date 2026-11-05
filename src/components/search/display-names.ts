import { COUNTRIES, LANGUAGE_CODES, LANGUAGE_LABELS_FR, type CountryCode, type LanguageCode } from "@/domain/country";
import { ORIGIN_COUNTRIES, type OriginCode } from "@/domain/origin";
import { LANGUAGE_NAMES, REGION_NAMES } from "@/domain/place-names";
import type { Locale } from "@/i18n/config";

/**
 * Country and language names in the interface language, from fixed tables (src/domain/place-names.ts):
 * the server and the browser must write the same words, which Intl.DisplayNames does not promise.
 * French keeps the reference names of the domain.
 */

/** A destination market, e.g. « Royaume-Uni », "United Kingdom", « Reino Unido ». */
export function countryName(code: CountryCode, locale: Locale): string {
  if (locale === "fr") return COUNTRIES[code].nameFr;
  return REGION_NAMES[locale][code] ?? COUNTRIES[code].nameEn;
}

/** A country a parcel ships from. */
export function originName(code: OriginCode, locale: Locale): string {
  if (locale === "fr") return ORIGIN_COUNTRIES.find((o) => o.code === code)?.nameFr ?? code;
  return REGION_NAMES[locale][code] ?? code;
}

/** A search language, capitalized as a menu entry (« Espagnol », "Spanish", « Español »). */
export function languageName(code: LanguageCode, locale: Locale): string {
  if (locale === "fr") return LANGUAGE_LABELS_FR[code];
  return LANGUAGE_NAMES[locale][code];
}

/** The language a typed product name is assumed to be in: the interface language (all three are search languages). */
export function inputLanguageFor(locale: Locale): LanguageCode {
  return (LANGUAGE_CODES as readonly string[]).includes(locale) ? (locale as LanguageCode) : "fr";
}
