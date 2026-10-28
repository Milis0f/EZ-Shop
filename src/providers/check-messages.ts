import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { t } from "@/i18n/translate";
import type { ConnectionCheckStep } from "./contracts";

/**
 * Text of the live connection test (each adapter's diagnose()), in the locale of the person running it.
 * Error codes come from the API; what they mean and what to do about it comes from the dictionary.
 */

export const checkMessages = (locale: Locale) => messagesFor("connectors", locale).check;

type Hints = Readonly<Record<string, string>>;

const hintFor = (hints: Hints, reason: string | undefined): string | undefined =>
  reason !== undefined && Object.prototype.hasOwnProperty.call(hints, reason) ? hints[reason] : undefined;

/** The explanation of an API error code, or the error itself, plus the raw code as a detail item. */
export function errorDetail(
  locale: Locale,
  hints: Hints,
  provider: string,
  message: string,
  reason: string | undefined,
  fallback?: string,
): Pick<ConnectionCheckStep, "detail" | "items"> {
  const m = checkMessages(locale);
  const detail = hintFor(hints, reason) ?? fallback ?? t(m.errorReturned, { message });
  return { detail, ...(reason ? { items: [t(m.code, { provider, reason })] } : {}) };
}
