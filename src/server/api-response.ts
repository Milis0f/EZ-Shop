import "server-only";
import { NextResponse } from "next/server";
import { localizeInputIssues } from "@/domain/validation-messages";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { AnalysisValidationError } from "./pipeline/run-analysis";

/** Consistent API envelope: { success, data, error }. Internal details never leak to clients. */

export interface ApiEnvelope<T> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error: { readonly code: string; readonly message: string; readonly details?: unknown } | null;
}

export const apiOk = <T>(data: T, status = 200) =>
  NextResponse.json<ApiEnvelope<T>>({ success: true, data, error: null }, { status });

export const apiError = (status: number, code: string, message: string, details?: unknown, headers?: HeadersInit) =>
  NextResponse.json<ApiEnvelope<null>>({ success: false, data: null, error: { code, message, details } }, { status, headers });

/** The API messages of a locale (route handlers get it from `requestLocale`). */
export const apiMessages = (locale: Locale) => messagesFor("serverMessages", locale).api;

/** Validation issues keep their key as `code` and their text in the request's locale. */
export function apiErrorFrom(error: unknown, locale: Locale = DEFAULT_LOCALE) {
  const m = apiMessages(locale);
  if (error instanceof AnalysisValidationError) {
    return apiError(400, "invalid_input", m.invalidInput, localizeInputIssues(error.issues, locale));
  }
  console.error("[api] unexpected error", error);
  return apiError(500, "internal_error", m.internalError);
}
