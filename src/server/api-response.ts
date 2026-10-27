import "server-only";
import { NextResponse } from "next/server";
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

export function apiErrorFrom(error: unknown) {
  if (error instanceof AnalysisValidationError) return apiError(400, "invalid_input", "Entrée invalide.", error.issues);
  console.error("[api] unexpected error", error);
  return apiError(500, "internal_error", "Erreur interne.");
}
