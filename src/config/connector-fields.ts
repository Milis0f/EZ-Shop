import type { ProviderId } from "@/domain/provenance";
import type { ProviderMeta } from "@/providers/contracts";

/**
 * What each connector variable is, in the user's words. Shared by the configuration form (client)
 * and the server action that writes .env.local: contains descriptions only, never values.
 */

export interface EnvFieldSpec {
  readonly label: string;
  readonly help: string;
  /** Secrets are write-only: the current value is never sent back to the browser. */
  readonly secret: boolean;
  readonly placeholder?: string;
  /** Stricter format for identifiers and versions, checked on save. */
  readonly pattern?: RegExp;
  readonly patternHint?: string;
  /** Values that are well-formed but are the wrong credential (a common copy-paste mistake), with the fix. */
  readonly rejects?: ReadonlyArray<{ readonly test: RegExp; readonly message: string }>;
  readonly helpUrl?: string;
}

export const ENV_FIELDS: Readonly<Record<string, EnvFieldSpec>> = {
  GOOGLE_TRENDS_API_KEY: {
    label: "Clé API Google Trends",
    help: "Délivrée par Google après acceptation de la candidature à l'API alpha.",
    secret: true,
  },
  GOOGLE_ADS_API_VERSION: {
    label: "Version de l'API",
    help: "Version en cours de l'API Google Ads, indiquée dans les notes de version.",
    secret: false,
    placeholder: "vNN",
    pattern: /^v\d{1,3}$/,
    patternHint: "Format attendu : v suivi du numéro, par exemple v20.",
    helpUrl: "https://developers.google.com/google-ads/api/docs/release-notes",
  },
  GOOGLE_ADS_CLIENT_ID: {
    label: "ID client OAuth",
    help: "Google Cloud Console, identifiants OAuth 2.0. Le projet de ce client porte le niveau d'accès à l'API (Keyword Planner exige Basic).",
    secret: true,
    pattern: /\.apps\.googleusercontent\.com$/,
    patternHint: "Un ID client OAuth Google se termine par .apps.googleusercontent.com.",
    rejects: [{ test: /^AIza/, message: "C'est une clé API Google Cloud (AIza…), pas un ID client OAuth." }],
    helpUrl: "https://console.cloud.google.com/google/ads-apis/overview",
  },
  GOOGLE_ADS_CLIENT_SECRET: {
    label: "Secret client OAuth",
    help: "Affiché avec l'ID client dans Google Cloud Console.",
    secret: true,
  },
  GOOGLE_ADS_REFRESH_TOKEN: {
    label: "Jeton d'actualisation OAuth",
    help: "Généré une fois avec l'ID et le secret client, en autorisant le compte Google Ads. Il commence par 1//.",
    secret: true,
    rejects: [
      { test: /^4\//, message: "C'est un code d'autorisation (4/…) : il s'échange une seule fois contre le jeton d'actualisation (1//…)." },
      { test: /^ya29\./, message: "C'est un jeton d'accès (ya29.…), valable une heure : il faut le jeton d'actualisation (1//…)." },
    ],
    pattern: /^1\/\//,
    patternHint: "Un jeton d'actualisation Google commence par 1//. Vérifie que tu n'as pas copié une autre valeur.",
  },
  GOOGLE_ADS_CUSTOMER_ID: {
    label: "ID du compte Google Ads",
    help: "Compte utilisé pour Keyword Planner, affiché en haut de l'interface Google Ads.",
    secret: false,
    placeholder: "123-456-7890",
    pattern: /^\d{3}-?\d{3}-?\d{4}$/,
    patternHint: "10 chiffres, tirets facultatifs.",
  },
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: {
    label: "ID du compte administrateur",
    help: "Seulement si l'accès passe par un compte administrateur (MCC).",
    secret: false,
    placeholder: "123-456-7890",
    pattern: /^\d{3}-?\d{3}-?\d{4}$/,
    patternHint: "10 chiffres, tirets facultatifs.",
  },
  META_GRAPH_API_VERSION: {
    label: "Version du Graph API",
    help: "Version en cours du Graph API, indiquée dans le changelog Meta.",
    secret: false,
    placeholder: "vNN.0",
    pattern: /^v\d{1,3}\.\d{1,2}$/,
    patternHint: "Format attendu : vNN.N, par exemple v23.0.",
    helpUrl: "https://developers.facebook.com/docs/graph-api/changelog",
  },
  META_AD_LIBRARY_ACCESS_TOKEN: {
    label: "Jeton d'accès",
    help: "Compte développeur Meta avec identité confirmée pour l'Ad Library API.",
    secret: true,
  },
  TIKTOK_CLIENT_KEY: {
    label: "Client key",
    help: "Application approuvée pour la Commercial Content API, portail développeurs TikTok.",
    secret: true,
  },
  TIKTOK_CLIENT_SECRET: {
    label: "Client secret",
    help: "Affiché avec la client key de la même application.",
    secret: true,
  },
  WIKIMEDIA_CONTACT: {
    label: "Contact pour Wikimedia",
    help: "Ton email ou l'adresse d'une page te concernant, envoyé dans l'en-tête des requêtes. Wikimedia passe alors de 10 à 200 requêtes par minute.",
    secret: false,
    placeholder: "toi@exemple.fr",
    pattern: /^([^@\s]+@[^@\s]+\.[a-z]{2,}|https:\/\/\S+)$/i,
    patternHint: "Une adresse email ou une adresse web en https://.",
  },
  YOUTUBE_API_KEY: {
    label: "Clé API Google Cloud",
    help: "Clé d'un projet où la YouTube Data API v3 est activée. Ta clé AIza… existante convient si l'API est activée dans son projet.",
    secret: true,
    placeholder: "AIza…",
    pattern: /^AIza[\w-]{30,}$/,
    patternHint: "Une clé API Google commence par AIza.",
  },
  EBAY_CLIENT_ID: {
    label: "App ID (Client ID)",
    help: "Jeu de clés Production de ton application, page Application Keys du portail développeur eBay.",
    secret: true,
    rejects: [{ test: /SBX/, message: "C'est une clé Sandbox (SBX) : utilise le jeu de clés Production." }],
  },
  EBAY_CLIENT_SECRET: {
    label: "Cert ID (Client Secret)",
    help: "Affiché à côté de l'App ID dans le même jeu de clés Production.",
    secret: true,
    rejects: [{ test: /^SBX-/, message: "C'est une clé Sandbox (SBX) : utilise le jeu de clés Production." }],
  },
  ALIEXPRESS_APP_KEY: {
    label: "App Key",
    help: "Console de l'AliExpress Open Platform, dans les informations de ton application validée.",
    secret: false,
    pattern: /^\d{5,12}$/,
    patternHint: "L'App Key AliExpress est un nombre.",
  },
  ALIEXPRESS_APP_SECRET: {
    label: "App Secret",
    help: "Affiché avec l'App Key dans la console de l'Open Platform.",
    secret: true,
  },
  ALIEXPRESS_TRACKING_ID: {
    label: "Tracking ID",
    help: "Identifiant de suivi de ton compte affilié AliExpress Portals. Sans lui, certaines applications ne reçoivent aucun produit.",
    secret: false,
  },
  META_MARKETING_ACCESS_TOKEN: {
    label: "Jeton d'accès Marketing API",
    help: "Jeton d'un utilisateur système ou d'une application ayant accès au compte publicitaire.",
    secret: true,
  },
  META_AD_ACCOUNT_ID: {
    label: "ID du compte publicitaire",
    help: "Gestionnaire de publicités Meta, paramètres du compte.",
    secret: false,
    placeholder: "act_1234567890",
    pattern: /^(act_)?\d{5,20}$/,
    patternHint: "Chiffres, avec ou sans le préfixe act_.",
  },
  TIKTOK_BUSINESS_ACCESS_TOKEN: {
    label: "Jeton d'accès TikTok for Business",
    help: "Jeton long terme de l'application Marketing API autorisée sur le compte annonceur.",
    secret: true,
  },
  TIKTOK_ADVERTISER_ID: {
    label: "ID annonceur",
    help: "Identifiant du compte annonceur dans TikTok Ads Manager.",
    secret: false,
    pattern: /^\d{5,25}$/,
    patternHint: "Chiffres uniquement.",
  },
};

/** Connectors whose saved credentials can be checked against the real API from the settings form. */
export const TESTABLE_PROVIDERS: ReadonlySet<ProviderId> = new Set<ProviderId>([
  "google-ads-keyword-planner",
  "youtube-data",
  "ebay-browse",
  "aliexpress-affiliate",
]);

/** Variables a connector can use without needing them. */
const OPTIONAL_ENV: Partial<Record<ProviderId, readonly string[]>> = {
  "google-ads-keyword-planner": ["GOOGLE_ADS_LOGIN_CUSTOMER_ID"],
  "aliexpress-affiliate": ["ALIEXPRESS_TRACKING_ID"],
  wikimedia: ["WIKIMEDIA_CONTACT"],
};

export interface ConnectorField extends EnvFieldSpec {
  readonly name: string;
  readonly optional: boolean;
}

/** What the browser may know about a variable: whether it is set, and the value only when it is not a secret. */
export interface FieldState {
  readonly name: string;
  readonly optional: boolean;
  readonly set: boolean;
  readonly value?: string;
}

/** Whether this request may write .env.local (see getEnvEditorAccess). */
export type EnvEditorAccess = { readonly enabled: true } | { readonly enabled: false; readonly reason: string };

export function connectorFields(meta: Pick<ProviderMeta, "id" | "requiredEnv">): ConnectorField[] {
  const names = [...meta.requiredEnv.map((name) => ({ name, optional: false })), ...(OPTIONAL_ENV[meta.id] ?? []).map((name) => ({ name, optional: true }))];
  return names.map(({ name, optional }) => {
    const spec = ENV_FIELDS[name];
    if (!spec) throw new Error(`No field description for ${name}`);
    return { ...spec, name, optional };
  });
}

/**
 * Credentials only ever use these characters. Excluding quotes, "$", "#", spaces and backslashes means
 * a value can be written to .env.local unquoted and read back unchanged (no escaping, no expansion).
 */
const SAFE_VALUE = /^[A-Za-z0-9._~+/=:@,|-]+$/;
export const MAX_VALUE_LENGTH = 4096;

export function validateEnvValue(
  field: Pick<EnvFieldSpec, "pattern" | "patternHint" | "rejects">,
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, error: "Valeur vide." };
  if (value.length > MAX_VALUE_LENGTH) return { ok: false, error: "Valeur trop longue." };
  if (!SAFE_VALUE.test(value)) {
    return { ok: false, error: "Caractères non pris en charge (espace, guillemet, $, #, \\). Vérifie la valeur copiée." };
  }
  const mistake = field.rejects?.find((r) => r.test.test(value));
  if (mistake) return { ok: false, error: mistake.message };
  if (field.pattern && !field.pattern.test(value)) return { ok: false, error: field.patternHint ?? "Format inattendu." };
  return { ok: true, value };
}
