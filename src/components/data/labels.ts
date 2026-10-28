import { Fragment, createElement, type ReactNode } from "react";
import { originName, type OriginCode } from "@/domain/origin";
import { sourceName } from "@/engine/report/localize";
import { INTL_LOCALES, type Locale } from "@/i18n/config";
import { messagesFor, type Messages } from "@/i18n/messages";

/**
 * Locale-aware labels for the advanced analysis and country pages. Country, language, month,
 * source, criterion and verdict names come from src/engine/report/localize.ts (shared with the
 * report); this file adds what only these pages need.
 */

export type AdvancedMessages = Messages<"analysisAdvanced">;

export const advancedMessages = (locale: Locale): AdvancedMessages => messagesFor("analysisAdvanced", locale);

const lookup = (table: Readonly<Record<string, string>>, id: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(table, id) ? table[id] : undefined;

/** A label keyed by an engine id, falling back to the stored (French) label for unknown ids. */
export const byId = (table: Readonly<Record<string, string>>, id: string, fallback: string): string => lookup(table, id) ?? fallback;

export function originCountryName(code: OriginCode, locale: Locale): string {
  if (locale === "fr") return originName(code);
  return new Intl.DisplayNames([INTL_LOCALES[locale]], { type: "region" }).of(code) ?? code;
}

/** Labels for the machine-readable `missing` entries of DATA_INSUFFICIENT values (sources or inputs). */
export const missingLabel = (key: string, locale: Locale): string => lookup(advancedMessages(locale).labels.missing, key) ?? sourceName(key, locale);

/** Full month name of month 1–12, as the language writes it inside a sentence. */
export const monthLong = (month: number, locale: Locale): string =>
  new Intl.DateTimeFormat(INTL_LOCALES[locale], { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, month - 1, 15)));

/**
 * Like t(), but params may be React nodes ("Score {score}, ..." with {score} in bold).
 * The text around the placeholders comes from the dictionary.
 */
export function rich(template: string, params: Readonly<Record<string, ReactNode>>): ReactNode[] {
  return template
    .split(/\{(\w+)\}/g)
    .map((part, i) => (i % 2 === 1 ? createElement(Fragment, { key: i }, Object.prototype.hasOwnProperty.call(params, part) ? params[part] : `{${part}}`) : part));
}
