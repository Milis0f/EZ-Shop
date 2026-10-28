import { COUNTRIES, LANGUAGE_CODES, LANGUAGE_LABELS_FR, type CountryCode, type LanguageCode } from "@/domain/country";
import { ORIGIN_COUNTRIES, type OriginCode } from "@/domain/origin";
import { INTL_LOCALES, type Locale } from "@/i18n/config";

/**
 * Country and language names in the interface language. French keeps the reference names of the domain
 * (byte-for-byte what the app printed before i18n); English and Spanish come from Intl.DisplayNames,
 * with a few overrides where the CLDR name is a legal one too long for a chip.
 */

const OVERRIDES: Readonly<Partial<Record<Locale, Readonly<Record<string, string>>>>> = {
  en: { HK: "Hong Kong" },
  es: { HK: "Hong Kong" },
};

const cache = new Map<string, Intl.DisplayNames>();

function displayNames(locale: Locale, type: "region" | "language"): Intl.DisplayNames {
  const key = `${locale}|${type}`;
  let names = cache.get(key);
  if (!names) {
    names = new Intl.DisplayNames(INTL_LOCALES[locale], { type });
    cache.set(key, names);
  }
  return names;
}

const capitalize = (text: string, locale: Locale): string =>
  text.charAt(0).toLocaleUpperCase(INTL_LOCALES[locale]) + text.slice(1);

function regionName(code: string, locale: Locale): string {
  return OVERRIDES[locale]?.[code] ?? displayNames(locale, "region").of(code) ?? code;
}

/** A destination market, e.g. « Royaume-Uni », "United Kingdom", « Reino Unido ». */
export function countryName(code: CountryCode, locale: Locale): string {
  if (locale === "fr") return COUNTRIES[code].nameFr;
  if (locale === "en") return COUNTRIES[code].nameEn;
  return regionName(code, locale);
}

/** A country a parcel ships from. */
export function originName(code: OriginCode, locale: Locale): string {
  if (locale === "fr") return ORIGIN_COUNTRIES.find((o) => o.code === code)?.nameFr ?? code;
  return regionName(code, locale);
}

/** A search language, capitalized as a menu entry (« Espagnol », "Spanish", « Español »). */
export function languageName(code: LanguageCode, locale: Locale): string {
  if (locale === "fr") return LANGUAGE_LABELS_FR[code];
  return capitalize(displayNames(locale, "language").of(code) ?? code, locale);
}

/** The language a typed product name is assumed to be in: the interface language (all three are search languages). */
export function inputLanguageFor(locale: Locale): LanguageCode {
  return (LANGUAGE_CODES as readonly string[]).includes(locale) ? (locale as LanguageCode) : "fr";
}
