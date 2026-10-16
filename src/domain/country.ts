/**
 * Country reference data (ISO 3166-1). Analysis is strictly country-level:
 * no region, department, city or postal code ever enters the model.
 */

export const LANGUAGE_CODES = ["fr", "en", "de", "nl", "es", "it", "pt", "pl", "sv", "da"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export const LANGUAGE_LABELS_FR: Record<LanguageCode, string> = {
  fr: "Français",
  en: "Anglais",
  de: "Allemand",
  nl: "Néerlandais",
  es: "Espagnol",
  it: "Italien",
  pt: "Portugais",
  pl: "Polonais",
  sv: "Suédois",
  da: "Danois",
};

export type CurrencyCode = "EUR" | "CHF" | "GBP" | "USD" | "CAD" | "AUD" | "PLN" | "SEK" | "DKK";

export interface Country {
  readonly code: CountryCode;
  readonly iso3: string;
  readonly isoNumeric: number;
  readonly nameFr: string;
  readonly nameEn: string;
  readonly currency: CurrencyCode;
  /** Search languages, most used first. The first one drives keyword targeting. */
  readonly languages: readonly LanguageCode[];
  readonly isEU: boolean;
  readonly isOECD: boolean;
}

export const COUNTRY_CODES = [
  "FR", "BE", "CH", "LU", "DE", "AT", "NL", "ES", "IT",
  "PT", "IE", "PL", "SE", "DK", "GB", "US", "CA", "AU",
] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

const c = (
  code: CountryCode,
  iso3: string,
  isoNumeric: number,
  nameFr: string,
  nameEn: string,
  currency: CurrencyCode,
  languages: readonly LanguageCode[],
  isEU: boolean,
): Country => ({ code, iso3, isoNumeric, nameFr, nameEn, currency, languages, isEU, isOECD: true });

export const COUNTRIES: Readonly<Record<CountryCode, Country>> = {
  FR: c("FR", "FRA", 250, "France", "France", "EUR", ["fr"], true),
  BE: c("BE", "BEL", 56, "Belgique", "Belgium", "EUR", ["nl", "fr", "de"], true),
  CH: c("CH", "CHE", 756, "Suisse", "Switzerland", "CHF", ["de", "fr", "it"], false),
  LU: c("LU", "LUX", 442, "Luxembourg", "Luxembourg", "EUR", ["fr", "de"], true),
  DE: c("DE", "DEU", 276, "Allemagne", "Germany", "EUR", ["de"], true),
  AT: c("AT", "AUT", 40, "Autriche", "Austria", "EUR", ["de"], true),
  NL: c("NL", "NLD", 528, "Pays-Bas", "Netherlands", "EUR", ["nl"], true),
  ES: c("ES", "ESP", 724, "Espagne", "Spain", "EUR", ["es"], true),
  IT: c("IT", "ITA", 380, "Italie", "Italy", "EUR", ["it"], true),
  PT: c("PT", "PRT", 620, "Portugal", "Portugal", "EUR", ["pt"], true),
  IE: c("IE", "IRL", 372, "Irlande", "Ireland", "EUR", ["en"], true),
  PL: c("PL", "POL", 616, "Pologne", "Poland", "PLN", ["pl"], true),
  SE: c("SE", "SWE", 752, "Suède", "Sweden", "SEK", ["sv"], true),
  DK: c("DK", "DNK", 208, "Danemark", "Denmark", "DKK", ["da"], true),
  GB: c("GB", "GBR", 826, "Royaume-Uni", "United Kingdom", "GBP", ["en"], false),
  US: c("US", "USA", 840, "États-Unis", "United States", "USD", ["en"], false),
  CA: c("CA", "CAN", 124, "Canada", "Canada", "CAD", ["en", "fr"], false),
  AU: c("AU", "AUS", 36, "Australie", "Australia", "AUD", ["en"], false),
};

export const DEFAULT_COUNTRY_SELECTION: readonly CountryCode[] = ["FR", "BE", "CH", "DE", "ES", "IT", "GB", "US", "CA"];

export const getCountry = (code: CountryCode): Country => COUNTRIES[code];

export const isCountryCode = (value: string): value is CountryCode =>
  (COUNTRY_CODES as readonly string[]).includes(value);
