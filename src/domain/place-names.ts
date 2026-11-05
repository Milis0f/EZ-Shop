import type { LanguageCode } from "./country";

/**
 * Country and language names in English and Spanish, fixed here rather than asked from Intl.DisplayNames:
 * the server and the browser ship different copies of the world's naming data (Node named KR "South
 * Korea" where Edge named it "Korea"), and a page rendered on one and taken over by the other must show
 * the same words. French keeps its reference names in country.ts and origin.ts. Taken from CLDR as Node
 * 22 (ICU 77.1) gives them, Hong Kong shortened.
 */

export type NamedLocale = "en" | "es";

export const REGION_NAMES: Readonly<Record<NamedLocale, Readonly<Record<string, string>>>> = {
  en: {
    CN: "China", HK: "Hong Kong", TW: "Taiwan", VN: "Vietnam", IN: "India", BD: "Bangladesh", PK: "Pakistan", TH: "Thailand", ID: "Indonesia", MY: "Malaysia",
    KR: "South Korea", JP: "Japan", TR: "Türkiye", US: "United States", GB: "United Kingdom", CH: "Switzerland", CA: "Canada", AU: "Australia", FR: "France",
    DE: "Germany", IT: "Italy", ES: "Spain", PT: "Portugal", NL: "Netherlands", BE: "Belgium", PL: "Poland", CZ: "Czechia", RO: "Romania", LU: "Luxembourg",
    AT: "Austria", IE: "Ireland", SE: "Sweden", DK: "Denmark",
  },
  es: {
    CN: "China", HK: "Hong Kong", TW: "Taiwán", VN: "Vietnam", IN: "India", BD: "Bangladés", PK: "Pakistán", TH: "Tailandia", ID: "Indonesia", MY: "Malasia",
    KR: "Corea del Sur", JP: "Japón", TR: "Turquía", US: "Estados Unidos", GB: "Reino Unido", CH: "Suiza", CA: "Canadá", AU: "Australia", FR: "Francia",
    DE: "Alemania", IT: "Italia", ES: "España", PT: "Portugal", NL: "Países Bajos", BE: "Bélgica", PL: "Polonia", CZ: "Chequia", RO: "Rumanía", LU: "Luxemburgo",
    AT: "Austria", IE: "Irlanda", SE: "Suecia", DK: "Dinamarca",
  },
};

/** Capitalized, as menu entries. */
export const LANGUAGE_NAMES: Readonly<Record<NamedLocale, Readonly<Record<LanguageCode, string>>>> = {
  en: { fr: "French", en: "English", de: "German", nl: "Dutch", es: "Spanish", it: "Italian", pt: "Portuguese", pl: "Polish", sv: "Swedish", da: "Danish" },
  es: { fr: "Francés", en: "Inglés", de: "Alemán", nl: "Neerlandés", es: "Español", it: "Italiano", pt: "Portugués", pl: "Polaco", sv: "Sueco", da: "Danés" },
};
