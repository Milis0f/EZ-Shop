import type { ErrorDescription } from "../http";

/**
 * Google error bodies → their error code only (never the free-text message).
 * OAuth: { "error": "invalid_grant", "error_description": "..." }
 * Google Ads REST: { "error": { "status": "PERMISSION_DENIED", "details": [{ "errors": [{ "errorCode": { "authorizationError": "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION" } }] }] } }
 */

const OAUTH_REJECTIONS = new Set(["invalid_grant", "invalid_client", "unauthorized_client"]);

const parse = (body: string): unknown => {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
};

const record = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

export function describeOAuthError(_status: number, body: string): ErrorDescription | undefined {
  const error = record(parse(body))?.error;
  if (typeof error !== "string") return undefined;
  return { reason: error, ...(OAUTH_REJECTIONS.has(error) ? { code: "unauthorized" as const } : {}) };
}

export function describeAdsError(_status: number, body: string): ErrorDescription | undefined {
  const error = record(record(parse(body))?.error);
  if (!error) return undefined;
  const details = Array.isArray(error.details) ? error.details : [];
  for (const detail of details) {
    const errors = record(detail)?.errors;
    for (const e of Array.isArray(errors) ? errors : []) {
      const code = Object.values(record(record(e)?.errorCode) ?? {}).find((v) => typeof v === "string");
      if (typeof code === "string") return { reason: code };
    }
  }
  return typeof error.status === "string" ? { reason: error.status } : undefined;
}

/** The code in parentheses at the end of an error message, e.g. "…: HTTP 400 (invalid_grant)". */
export const reasonOf = (message: string): string | undefined => /\(([A-Za-z0-9_.]+)\)$/.exec(message)?.[1];
