/**
 * Countries a product can be shipped from, for import duties. Origin is a country of manufacture /
 * dispatch, independent of the destination markets analysed (COUNTRY_CODES).
 */

export const ORIGIN_COUNTRIES = [
  { code: "CN", nameFr: "Chine", isEU: false },
  { code: "HK", nameFr: "Hong Kong", isEU: false },
  { code: "TW", nameFr: "Taïwan", isEU: false },
  { code: "VN", nameFr: "Viêt Nam", isEU: false },
  { code: "IN", nameFr: "Inde", isEU: false },
  { code: "BD", nameFr: "Bangladesh", isEU: false },
  { code: "PK", nameFr: "Pakistan", isEU: false },
  { code: "TH", nameFr: "Thaïlande", isEU: false },
  { code: "ID", nameFr: "Indonésie", isEU: false },
  { code: "MY", nameFr: "Malaisie", isEU: false },
  { code: "KR", nameFr: "Corée du Sud", isEU: false },
  { code: "JP", nameFr: "Japon", isEU: false },
  { code: "TR", nameFr: "Turquie", isEU: false },
  { code: "US", nameFr: "États-Unis", isEU: false },
  { code: "GB", nameFr: "Royaume-Uni", isEU: false },
  { code: "CH", nameFr: "Suisse", isEU: false },
  { code: "CA", nameFr: "Canada", isEU: false },
  { code: "AU", nameFr: "Australie", isEU: false },
  { code: "FR", nameFr: "France", isEU: true },
  { code: "DE", nameFr: "Allemagne", isEU: true },
  { code: "IT", nameFr: "Italie", isEU: true },
  { code: "ES", nameFr: "Espagne", isEU: true },
  { code: "PT", nameFr: "Portugal", isEU: true },
  { code: "NL", nameFr: "Pays-Bas", isEU: true },
  { code: "BE", nameFr: "Belgique", isEU: true },
  { code: "PL", nameFr: "Pologne", isEU: true },
  { code: "CZ", nameFr: "Tchéquie", isEU: true },
  { code: "RO", nameFr: "Roumanie", isEU: true },
] as const;

export type OriginCode = (typeof ORIGIN_COUNTRIES)[number]["code"];

export const ORIGIN_CODES = ORIGIN_COUNTRIES.map((o) => o.code) as unknown as readonly [OriginCode, ...OriginCode[]];

export const originName = (code: OriginCode): string => ORIGIN_COUNTRIES.find((o) => o.code === code)?.nameFr ?? code;

export const isEuOrigin = (code: OriginCode): boolean => ORIGIN_COUNTRIES.find((o) => o.code === code)?.isEU ?? false;
