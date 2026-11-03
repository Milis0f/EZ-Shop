import "server-only";
import { z } from "zod";
import { envValue } from "./vault-values";

/**
 * Server-side environment, validated once. Secrets never leave this module
 * except through the provider adapters that need them.
 */

const optionalSecret = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

/** Local LLM (GGUF) read by src/server/ai/engine.ts, relative to the project root unless absolute. */
export const DEFAULT_LOCAL_AI_MODEL_PATH = ".data/models/Qwen3.5-9B-Q4_K_M.gguf";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Postgres / Supabase connection string. When absent, a local PGlite database is used. */
  DATABASE_URL: optionalSecret,
  PGLITE_DATA_DIR: z.string().default(".data/pglite"),
  // Backups of the embedded database: folder (default: `backups` next to it), how many to keep, how often.
  BACKUP_DIR: optionalSecret,
  BACKUP_KEEP: z.coerce.number().int().min(1).max(100).default(10),
  BACKUP_INTERVAL_HOURS: z.coerce.number().min(1).max(24 * 30).default(24),

  PROVIDER_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(12_000),

  // Local AI (node-llama-cpp, runs on this machine). Its text only rewords stored analyses, never adds data.
  // On by default; an empty value keeps the default. "false" turns it off without touching the model file.
  LOCAL_AI_ENABLED: z
    .enum(["true", "false", ""])
    .default("true")
    .transform((v) => v !== "false"),
  LOCAL_AI_MODEL_PATH: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : DEFAULT_LOCAL_AI_MODEL_PATH)),
  // "off" runs the model on the processor only, leaving the graphics card to other programs.
  LOCAL_AI_GPU: z
    .enum(["auto", "off", ""])
    .default("auto")
    .transform((v) => (v === "off" ? "off" : "auto")),

  // Web search: a SearXNG on this machine (free, no key), started on demand. See `npm run search:setup`.
  SEARXNG_URL: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\/+$/, "") : "http://127.0.0.1:8888")),
  SEARXNG_AUTOSTART: z
    .enum(["true", "false", ""])
    .default("true")
    .transform((v) => v !== "false"),

  // Google Trends API (alpha, access on application only).
  GOOGLE_TRENDS_API_KEY: optionalSecret,

  // Google Ads API — Keyword Planning. No developer token since the 2026-09-09 sunset: access levels
  // belong to the Google Cloud project that owns the OAuth client.
  GOOGLE_ADS_API_VERSION: optionalSecret,
  GOOGLE_ADS_CLIENT_ID: optionalSecret,
  GOOGLE_ADS_CLIENT_SECRET: optionalSecret,
  GOOGLE_ADS_REFRESH_TOKEN: optionalSecret,
  GOOGLE_ADS_CUSTOMER_ID: optionalSecret,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: optionalSecret,

  // Meta Ad Library API (Graph API ads_archive).
  META_GRAPH_API_VERSION: optionalSecret,
  META_AD_LIBRARY_ACCESS_TOKEN: optionalSecret,

  // TikTok Commercial Content API (research access, approval required).
  TIKTOK_CLIENT_KEY: optionalSecret,
  TIKTOK_CLIENT_SECRET: optionalSecret,

  // Wikimedia: contact (email or URL) put in the User-Agent. Wikimedia allows 10 requests/min without it, 200 with it.
  WIKIMEDIA_CONTACT: optionalSecret,

  // YouTube Data API v3 (Google Cloud API key, free daily quota).
  YOUTUBE_API_KEY: optionalSecret,

  // Shopify, the owner's own store ("Ma boutique"): a Dev Dashboard app installed on it. Kept apart from
  // the pre-launch analysis, which never reads the owner's sales.
  SHOPIFY_STORE_DOMAIN: optionalSecret,
  SHOPIFY_CLIENT_ID: optionalSecret,
  SHOPIFY_CLIENT_SECRET: optionalSecret,

  // Meta Marketing API, the owner's own ad account ("Ma boutique"): a token with ads_read and the account ID.
  META_ADS_ACCESS_TOKEN: optionalSecret,
  META_AD_ACCOUNT_ID: optionalSecret,

  // eBay Browse API (application keys: App ID = client id, Cert ID = client secret).
  EBAY_CLIENT_ID: optionalSecret,
  EBAY_CLIENT_SECRET: optionalSecret,

  // AliExpress Affiliate API (Open Platform app + affiliate tracking ID).
  ALIEXPRESS_APP_KEY: optionalSecret,
  ALIEXPRESS_APP_SECRET: optionalSecret,
  ALIEXPRESS_TRACKING_ID: optionalSecret,
});

export type ServerEnv = z.output<typeof envSchema>;

const ENV_KEYS = Object.keys(envSchema.shape);

let cached: { readonly fingerprint: string; readonly env: ServerEnv } | undefined;

/**
 * Parsed again only when one of its variables changed (connector settings saved from the UI,
 * or .env.local reloaded by the dev server), so a new key works without a restart.
 */
export function getEnv(): ServerEnv {
  // A secret kept in the system's credential store fills a variable the environment leaves empty.
  const source: Record<string, string | undefined> = { ...process.env };
  for (const k of ENV_KEYS) source[k] = envValue(k) ?? process.env[k];
  const fingerprint = ENV_KEYS.map((k) => source[k] ?? "").join("\u0000");
  if (cached?.fingerprint === fingerprint) return cached.env;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${fields}`);
  }
  cached = { fingerprint, env: parsed.data };
  return parsed.data;
}

/** Names of the variables from `keys` that are not set. */
export function missingEnv(env: ServerEnv, keys: ReadonlyArray<keyof ServerEnv>): string[] {
  return keys.filter((k) => env[k] === undefined || env[k] === "").map(String);
}
