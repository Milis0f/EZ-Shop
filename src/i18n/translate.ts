import { INTL_LOCALES, type Locale } from "./config";

export type TemplateParams = Readonly<Record<string, string | number>>;

/**
 * Replaces {name} placeholders with params. Numbers are inserted as given: format them first
 * (formatNumber, formatMoney...) when they need locale grouping. Unknown placeholders stay visible,
 * so a missing param shows up in review instead of silently disappearing.
 */
export function t(template: string, params: TemplateParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  );
}

/** Plural forms of one message. `other` is required; `zero` is an optional special case for 0. */
export interface PluralForms {
  readonly zero?: string;
  readonly one?: string;
  readonly other: string;
}

/**
 * Picks the plural form for count with Intl.PluralRules, then interpolates {count} and params.
 * Note: French treats 0 and 1 as "one" ("0 analyse"), English and Spanish treat 0 as "other".
 * `count` is inserted raw; pass a formatted value in params.count to override it.
 */
export function plural(locale: Locale, count: number, forms: PluralForms, params: TemplateParams = {}): string {
  const category = new Intl.PluralRules(INTL_LOCALES[locale]).select(count);
  const template = count === 0 && forms.zero !== undefined ? forms.zero : category === "one" && forms.one !== undefined ? forms.one : forms.other;
  return t(template, { count, ...params });
}
