import type { Locale } from "@/i18n/config";
import { formatInt, formatNumber, formatPct } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { en as serverMessagesEn } from "@/i18n/messages/server-messages";
import { t, type TemplateParams } from "@/i18n/translate";

/**
 * Validation messages travel as keys: the schema (src/domain/schemas.ts) is shared by the form and the API and
 * knows no locale, so each issue carries a key of the server-messages `validation` dictionary. The edge (server
 * action, route handler) turns it into text with `localizeInputIssue`, numbers formatted for the locale.
 */

/** Bounds the schema enforces, also inserted into the messages. */
export const VALIDATION_LIMITS = {
  productNameMin: 2,
  productNameMax: 80,
  categoryMin: 2,
  categoryMax: 60,
  supplierUrlMax: 2000,
  hsCodeMinDigits: 4,
  hsCodeMaxDigits: 10,
  maxAmountEur: 100_000,
  targetMarginMinPct: 1,
  targetMarginMaxPct: 95,
} as const;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** A dotted key of the `validation` dictionary, e.g. `productName.forbidden`. */
export type ValidationKey = Leaves<typeof serverMessagesEn.validation>;

/** Types a key at the call site, so a typo in the schema is a compile error. */
export const vk = (key: ValidationKey): ValidationKey => key;

/** A validation issue as the pipeline reports it: dotted path, message key and the custom issue's params. */
export interface RawInputIssue {
  readonly path: string;
  readonly message: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

/** A validation issue ready to show: dotted path and text in the active locale. */
export interface LocalizedInputIssue {
  readonly path: string;
  readonly code: ValidationKey;
  readonly message: string;
}

function lookup(key: string, locale: Locale): string | undefined {
  let node: unknown = messagesFor("serverMessages", locale).validation;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !Object.prototype.hasOwnProperty.call(node, part)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function isValidationKey(value: string): value is ValidationKey {
  return lookup(value, "en") !== undefined;
}

/** Whole euros, without cents: "€100,000" in English, "100 000 €" in French. */
const euros = (v: number, locale: Locale): string =>
  formatNumber(v, locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0, minimumFractionDigits: 0 });

/** The formatted values every placeholder can use; a template only picks the ones it names. */
function paramsFor(key: ValidationKey, locale: Locale, issueParams: RawInputIssue["params"]): TemplateParams {
  const L = VALIDATION_LIMITS;
  const platform = typeof issueParams?.platform === "string" ? issueParams.platform : "";
  if (key.startsWith("category.")) return { min: formatInt(L.categoryMin, locale), max: formatInt(L.categoryMax, locale) };
  if (key === "supplierUrl.tooLong") return { max: formatInt(L.supplierUrlMax, locale) };
  if (key === "supplierUrl.notProduct") return { platform };
  if (key === "hsCode.format") return { min: formatInt(L.hsCodeMinDigits, locale), max: formatInt(L.hsCodeMaxDigits, locale) };
  if (key === "targetMargin.range") {
    return { min: formatInt(L.targetMarginMinPct, locale), max: formatPct(L.targetMarginMaxPct, locale) };
  }
  return { max: euros(L.maxAmountEur, locale), zero: euros(0, locale) };
}

/** Turns a pipeline issue into text. A message that is not a key (a Zod default) becomes "Invalid value." */
export function localizeInputIssue(issue: RawInputIssue, locale: Locale): LocalizedInputIssue {
  const code: ValidationKey = isValidationKey(issue.message) ? issue.message : "invalidValue";
  const template = lookup(code, locale) ?? issue.message;
  return { path: issue.path, code, message: t(template, paramsFor(code, locale, issue.params)) };
}

export const localizeInputIssues = (issues: readonly RawInputIssue[], locale: Locale): LocalizedInputIssue[] =>
  issues.map((issue) => localizeInputIssue(issue, locale));
