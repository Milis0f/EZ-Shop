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

/** What each code means for the person setting the connector up, and what to do about it. */
export const GOOGLE_ADS_ERROR_HINTS: Readonly<Record<string, string>> = {
  invalid_grant:
    "Jeton d'actualisation refusé : valeur incorrecte, révoquée ou expirée, ou créée avec un autre ID client. Si l'écran de consentement OAuth est en mode « Test », Google l'invalide après 7 jours.",
  invalid_client: "ID client ou secret client refusé : vérifie qu'ils viennent du même identifiant OAuth.",
  unauthorized_client:
    "Ce jeton d'actualisation a été généré avec un autre client OAuth que l'ID client enregistré. Dans OAuth Playground, coche « Use your own OAuth credentials » et colle ton ID et secret client avant d'autoriser, puis régénère le jeton.",
  // Access levels belong to the Google Cloud project that owns the OAuth client (developer tokens sunset 2026-09-09).
  CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION:
    "Le projet Google Cloud du client OAuth est en accès « Test » : il ne peut interroger que des comptes de test. Demande l'accès Explorer puis Basic sur la page Google Ads API de Google Cloud Console (Keyword Planner exige Basic).",
  ACTION_NOT_PERMITTED:
    "Action refusée pour le niveau d'accès du projet Google Cloud. En accès Test, seuls les comptes de test répondent ; Keyword Planner exige l'accès Basic.",
  USER_PERMISSION_DENIED:
    "Le compte Google connecté n'a pas accès à ce compte Ads. Si l'accès passe par un compte administrateur, renseigne son ID.",
  NOT_ADS_USER: "Le compte Google connecté n'est associé à aucun compte Google Ads.",
  CUSTOMER_NOT_FOUND: "ID de compte Google Ads introuvable.",
  INVALID_CUSTOMER_ID: "ID de compte Google Ads invalide.",
  CUSTOMER_NOT_ENABLED: "Compte Google Ads désactivé ou pas encore finalisé.",
  OAUTH_TOKEN_INVALID: "Jeton OAuth refusé par Google Ads : régénère le jeton d'actualisation.",
  OAUTH_TOKEN_EXPIRED: "Jeton OAuth expiré : régénère le jeton d'actualisation.",
  GOOGLE_ACCOUNT_COOKIE_INVALID: "Session Google invalide : régénère le jeton d'actualisation.",
  RESOURCE_EXHAUSTED: "Quota de l'API Google Ads atteint : réessaie plus tard.",
  RESOURCE_TEMPORARILY_EXHAUSTED: "Quota de l'API Google Ads atteint : réessaie plus tard.",
  UNAUTHENTICATED: "Authentification refusée par Google Ads : régénère le jeton d'actualisation.",
  PERMISSION_DENIED: "Accès refusé par Google Ads.",
};

/** The code in parentheses at the end of an error message, e.g. "…: HTTP 400 (invalid_grant)". */
export const reasonOf = (message: string): string | undefined => /\(([A-Za-z0-9_.]+)\)$/.exec(message)?.[1];
