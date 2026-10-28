import type { ProviderId } from "@/domain/provenance";
import type { Locale } from "@/i18n/config";
import { messagesFor, type Messages } from "@/i18n/messages";
import type { ProviderMeta } from "@/providers/contracts";

/**
 * What each connector variable is, in the user's words (texts in src/i18n/messages/connectors.ts). Shared by the configuration form (client)
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

type FieldTexts = Messages<"connectors">["fields"];
type EnvName = keyof FieldTexts;

/** The language-independent part of a field; label, help, hints and reject messages live in the connectors dictionary. */
interface EnvFieldRule {
  readonly secret: boolean;
  /** Literal placeholder (a format such as vNN); a localized one comes from the dictionary instead. */
  readonly placeholder?: string;
  readonly pattern?: RegExp;
  /** Each key names a message in the dictionary entry's `rejects`. */
  readonly rejects?: ReadonlyArray<{ readonly test: RegExp; readonly key: string }>;
  readonly helpUrl?: string;
}

const ENV_RULES: Readonly<Record<EnvName, EnvFieldRule>> = {
  GOOGLE_TRENDS_API_KEY: { secret: true },
  GOOGLE_ADS_API_VERSION: {
    secret: false,
    placeholder: "vNN",
    pattern: /^v\d{1,3}$/,
    helpUrl: "https://developers.google.com/google-ads/api/docs/release-notes",
  },
  GOOGLE_ADS_CLIENT_ID: {
    secret: true,
    pattern: /\.apps\.googleusercontent\.com$/,
    rejects: [{ test: /^AIza/, key: "cloudKey" }],
    helpUrl: "https://console.cloud.google.com/google/ads-apis/overview",
  },
  GOOGLE_ADS_CLIENT_SECRET: { secret: true },
  GOOGLE_ADS_REFRESH_TOKEN: {
    secret: true,
    rejects: [
      { test: /^4\//, key: "authCode" },
      { test: /^ya29\./, key: "accessToken" },
    ],
    pattern: /^1\/\//,
  },
  GOOGLE_ADS_CUSTOMER_ID: { secret: false, placeholder: "123-456-7890", pattern: /^\d{3}-?\d{3}-?\d{4}$/ },
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: { secret: false, placeholder: "123-456-7890", pattern: /^\d{3}-?\d{3}-?\d{4}$/ },
  META_GRAPH_API_VERSION: {
    secret: false,
    placeholder: "vNN.0",
    pattern: /^v\d{1,3}\.\d{1,2}$/,
    helpUrl: "https://developers.facebook.com/docs/graph-api/changelog",
  },
  META_AD_LIBRARY_ACCESS_TOKEN: { secret: true },
  TIKTOK_CLIENT_KEY: { secret: true },
  TIKTOK_CLIENT_SECRET: { secret: true },
  WIKIMEDIA_CONTACT: { secret: false, pattern: /^([^@\s]+@[^@\s]+\.[a-z]{2,}|https:\/\/\S+)$/i },
  YOUTUBE_API_KEY: { secret: true, placeholder: "AIza…", pattern: /^AIza[\w-]{30,}$/ },
  EBAY_CLIENT_ID: { secret: true, rejects: [{ test: /SBX/, key: "sandbox" }] },
  EBAY_CLIENT_SECRET: { secret: true, rejects: [{ test: /^SBX-/, key: "sandbox" }] },
  ALIEXPRESS_APP_KEY: { secret: false, pattern: /^\d{5,12}$/ },
  ALIEXPRESS_APP_SECRET: { secret: true },
  ALIEXPRESS_TRACKING_ID: { secret: false },
  META_MARKETING_ACCESS_TOKEN: { secret: true },
  META_AD_ACCOUNT_ID: { secret: false, placeholder: "act_1234567890", pattern: /^(act_)?\d{5,20}$/ },
  TIKTOK_BUSINESS_ACCESS_TOKEN: { secret: true },
  TIKTOK_ADVERTISER_ID: { secret: false, pattern: /^\d{5,25}$/ },
};

/** One dictionary entry, seen without its exact literal keys. */
interface FieldText {
  readonly label: string;
  readonly help: string;
  readonly placeholder?: string;
  readonly patternHint?: string;
  readonly rejects?: Readonly<Record<string, string>>;
}

function buildEnvFields(locale: Locale): Readonly<Record<string, EnvFieldSpec>> {
  const texts = messagesFor("connectors", locale).fields;
  return Object.fromEntries(
    (Object.keys(ENV_RULES) as EnvName[]).map((name) => {
      const rule = ENV_RULES[name];
      const text: FieldText = texts[name];
      const placeholder = rule.placeholder ?? text.placeholder;
      const spec: EnvFieldSpec = {
        label: text.label,
        help: text.help,
        secret: rule.secret,
        ...(placeholder !== undefined ? { placeholder } : {}),
        ...(rule.pattern ? { pattern: rule.pattern } : {}),
        ...(text.patternHint !== undefined ? { patternHint: text.patternHint } : {}),
        ...(rule.rejects ? { rejects: rule.rejects.map((r) => ({ test: r.test, message: text.rejects?.[r.key] ?? "" })) } : {}),
        ...(rule.helpUrl ? { helpUrl: rule.helpUrl } : {}),
      };
      return [name, spec];
    }),
  );
}

const ENV_FIELDS_BY_LOCALE: Readonly<Record<Locale, Readonly<Record<string, EnvFieldSpec>>>> = {
  en: buildEnvFields("en"),
  fr: buildEnvFields("fr"),
  es: buildEnvFields("es"),
};

/** Every connector variable, described in one language. */
export function envFields(locale: Locale): Readonly<Record<string, EnvFieldSpec>> {
  return ENV_FIELDS_BY_LOCALE[locale];
}

/**
 * French descriptions, for callers not yet translated (the connection check). New code calls
 * envFields(locale) instead.
 */
export const ENV_FIELDS: Readonly<Record<string, EnvFieldSpec>> = ENV_FIELDS_BY_LOCALE.fr;

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

/** The connector's variables, described in `locale` (French by default, for callers not yet translated). */
export function connectorFields(meta: Pick<ProviderMeta, "id" | "requiredEnv">, locale: Locale = "fr"): ConnectorField[] {
  const specs = envFields(locale);
  const names = [...meta.requiredEnv.map((name) => ({ name, optional: false })), ...(OPTIONAL_ENV[meta.id] ?? []).map((name) => ({ name, optional: true }))];
  return names.map(({ name, optional }) => {
    const spec = specs[name];
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
  locale: Locale = "fr",
): { ok: true; value: string } | { ok: false; error: string } {
  const m = messagesFor("connectors", locale).validation;
  const value = raw.trim();
  if (value.length === 0) return { ok: false, error: m.empty };
  if (value.length > MAX_VALUE_LENGTH) return { ok: false, error: m.tooLong };
  if (!SAFE_VALUE.test(value)) {
    return { ok: false, error: m.unsafe };
  }
  const mistake = field.rejects?.find((r) => r.test.test(value));
  if (mistake) return { ok: false, error: mistake.message };
  if (field.pattern && !field.pattern.test(value)) return { ok: false, error: field.patternHint ?? m.unexpected };
  return { ok: true, value };
}
