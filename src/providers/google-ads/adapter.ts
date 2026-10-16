import { z } from "zod";
import { missingEnv, type ServerEnv } from "@/config/env";
import { getCountry, type LanguageCode } from "@/domain/country";
import type { SourceRef } from "@/domain/provenance";
import { addMonths, lastCompleteMonth, parseYearMonth } from "@/domain/time";
import {
  fail,
  ok,
  type ConnectionCheckStep,
  type ConnectionTestable,
  type KeywordMetrics,
  type KeywordMetricsProvider,
  type KeywordMetricsQuery,
  type ProviderMeta,
  type ProviderResult,
  type ProviderStatus,
} from "../contracts";
import { httpJson } from "../http";
import { sharedResult, type SharedResult } from "../shared-result";
import { describeAdsError, describeOAuthError, GOOGLE_ADS_ERROR_HINTS, reasonOf } from "./errors";
import { monthEnum, parseCurrency, parseHistoricalMetrics, parseLanguageConstant } from "./parse";

/**
 * Google Ads API — Keyword Planning (historical metrics: volumes, competition, top-of-page bids).
 * Written from the official REST reference; NOT yet run with real credentials.
 * TODO(google-ads): run against a test account, record a fixture, then mark "live_verified".
 *
 * No developer token: Google sunset them on 2026-09-09. The header is ignored today and will be rejected
 * in a future major version; API access (Test / Explorer / Basic / Standard) now belongs to the Google Cloud
 * project that owns the OAuth client. Keyword Planning needs Basic or Standard (Explorer excludes it).
 * https://developers.google.com/google-ads/api/docs/api-policy/developer-token
 */

const REQUIRED_ENV = [
  "GOOGLE_ADS_API_VERSION",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_CUSTOMER_ID",
] as const satisfies ReadonlyArray<keyof ServerEnv>;

export const googleAdsMeta: ProviderMeta = {
  id: "google-ads-keyword-planner",
  name: "Google Ads API — Keyword Planner",
  category: "keyword_metrics",
  authMode: "oauth",
  access: "account",
  docsUrl: "https://developers.google.com/google-ads/api/docs/keyword-planning/generate-historical-metrics",
  qualityTier: 1,
  connectorVersion: "0.2.0",
  requiredEnv: [...REQUIRED_ENV],
  coverage: { kind: "all" },
  verification: "documented_unverified",
  notes: [
    "Volumes mensuels absolus, indice de concurrence, enchères haut de page (micros → devise du compte).",
    "Plus de jeton développeur : l'accès dépend du projet Google Cloud du client OAuth. Keyword Planner exige le niveau Basic (vérification de la marque).",
  ],
};

const tokenSchema = z.object({ access_token: z.string().min(1) });

/** An access token lasts an hour; refresh it ten minutes early. */
const ACCESS_TOKEN_TTL_MS = 50 * 60 * 1000;

/** Country criterion IDs are 2000 + ISO 3166-1 numeric (e.g. France 250 → 2250). */
const geoTargetConstant = (isoNumeric: number): string => `geoTargetConstants/${2000 + isoNumeric}`;

export class GoogleAdsKeywordPlannerProvider implements KeywordMetricsProvider, ConnectionTestable {
  readonly meta = googleAdsMeta;
  /** One request per country runs in parallel on this instance: the token and the lookups are shared. */
  private readonly accessToken: SharedResult<string> = sharedResult(() => this.loadAccessToken(), { ttlMs: () => ACCESS_TOKEN_TTL_MS });
  private readonly currency: SharedResult<string> = sharedResult(() => this.loadCurrency());
  private readonly languages = new Map<LanguageCode, SharedResult<string>>();

  constructor(
    private readonly env: ServerEnv,
    private readonly timeoutMs: number,
  ) {}

  status(): ProviderStatus {
    const missing = missingEnv(this.env, REQUIRED_ENV);
    if (missing.length > 0) return { state: "not_configured", detail: `Variables manquantes : ${missing.join(", ")}` };
    return { state: "ready", detail: "Configuré — connecteur écrit depuis la doc, jamais vérifié en réel." };
  }

  async getKeywordMetrics(query: KeywordMetricsQuery): Promise<ProviderResult<readonly KeywordMetrics[]>> {
    if (this.status().state !== "ready") return fail("not_configured", "Google Ads Keyword Planner non configuré.");

    const token = await this.accessToken.get();
    if (!token.ok) return token;
    const [currency, language] = await Promise.all([this.currency.get(), this.getLanguage(query.language).get()]);
    if (!currency.ok) return currency;
    if (!language.ok) return language;

    const country = getCountry(query.country);
    const from = parseYearMonth(query.from);
    const to = parseYearMonth(query.to);
    const body = {
      keywords: query.terms.slice(0, 20),
      geoTargetConstants: [geoTargetConstant(country.isoNumeric)],
      language: language.data,
      keywordPlanNetwork: "GOOGLE_SEARCH",
      historicalMetricsOptions: {
        yearMonthRange: {
          start: { year: from.year, month: monthEnum(from.month) },
          end: { year: to.year, month: monthEnum(to.month) },
        },
      },
    };
    const raw = await this.call(token.data, ":generateKeywordHistoricalMetrics", body);
    if (!raw.ok) return raw;

    const source: SourceRef = {
      sourceId: this.meta.id,
      origin: "live",
      collectedAt: new Date().toISOString(),
      connectorVersion: this.meta.connectorVersion,
      queryRef: `generateKeywordHistoricalMetrics/${query.country}/${query.language}`,
      period: { start: query.from, end: query.to },
    };
    return parseHistoricalMetrics(raw.data, currency.data, source);
  }

  private async loadAccessToken(): Promise<ProviderResult<string>> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.env.GOOGLE_ADS_CLIENT_ID ?? "",
      client_secret: this.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
      refresh_token: this.env.GOOGLE_ADS_REFRESH_TOKEN ?? "",
    });
    const raw = await httpJson("https://oauth2.googleapis.com/token", "Google OAuth token", {
      timeoutMs: this.timeoutMs,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      attempts: 1,
      describeError: describeOAuthError,
    });
    if (!raw.ok) return raw;
    const parsed = tokenSchema.safeParse(raw.data);
    if (!parsed.success) return fail("invalid_response", "Google OAuth: missing access_token");
    return ok(parsed.data.access_token);
  }

  private async loadCurrency(): Promise<ProviderResult<string>> {
    const token = await this.accessToken.get();
    if (!token.ok) return token;
    const raw = await this.call(token.data, "/googleAds:search", { query: "SELECT customer.currency_code FROM customer LIMIT 1" });
    if (!raw.ok) return raw;
    const currency = parseCurrency(raw.data);
    if (!currency) return fail("invalid_response", "Google Ads: account currency not found");
    return ok(currency);
  }

  /** One shared lookup per language, created on first use. */
  private getLanguage(code: LanguageCode): SharedResult<string> {
    const known = this.languages.get(code);
    if (known) return known;
    const created = sharedResult(() => this.loadLanguage(code));
    this.languages.set(code, created);
    return created;
  }

  /** Resolve the language constant through the API instead of hard-coding IDs. */
  private async loadLanguage(code: LanguageCode): Promise<ProviderResult<string>> {
    const token = await this.accessToken.get();
    if (!token.ok) return token;
    const raw = await this.call(token.data, "/googleAds:search", {
      query: `SELECT language_constant.resource_name FROM language_constant WHERE language_constant.code = '${code}'`,
    });
    if (!raw.ok) return raw;
    const resource = parseLanguageConstant(raw.data);
    if (!resource) return fail("invalid_response", `Google Ads: language constant not found for ${code}`);
    return ok(resource);
  }

  private call(token: string, path: string, body: unknown): Promise<ProviderResult<unknown>> {
    const customerId = (this.env.GOOGLE_ADS_CUSTOMER_ID ?? "").replaceAll("-", "");
    const loginCustomerId = this.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replaceAll("-", "");
    const url = `https://googleads.googleapis.com/${this.env.GOOGLE_ADS_API_VERSION}/customers/${customerId}${path}`;
    return httpJson(url, `Google Ads ${path}`, {
      timeoutMs: this.timeoutMs,
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
      },
      body: JSON.stringify(body),
      describeError: describeAdsError,
    });
  }

  /**
   * Live check of the saved credentials, in the order Google uses them: OAuth, then account access
   * (which also checks the Cloud project's access level), then one real Keyword Planner request.
   * Stops at the first failing step.
   */
  async diagnose(now: Date): Promise<ConnectionCheckStep[]> {
    const missing = missingEnv(this.env, REQUIRED_ENV);
    if (missing.length > 0) {
      return [{ id: "oauth", label: "Connexion OAuth", status: "skipped", detail: `Variables manquantes : ${missing.join(", ")}.` }];
    }
    const steps: ConnectionCheckStep[] = [];
    const remaining = (ids: ReadonlyArray<[string, string]>) =>
      ids.map(([id, label]): ConnectionCheckStep => ({ id, label, status: "skipped", detail: "Non testé : l'étape précédente a échoué." }));
    const ACCOUNT: [string, string] = ["account", "Accès au compte Google Ads"];
    const PLANNER: [string, string] = ["planner", "Requête Keyword Planner"];

    this.accessToken.reset();
    const token = await this.accessToken.get();
    if (!token.ok) return [failedStep("oauth", "Connexion OAuth", token.error.message), ...remaining([ACCOUNT, PLANNER])];
    steps.push({ id: "oauth", label: "Connexion OAuth", status: "ok", detail: "ID client, secret et jeton d'actualisation acceptés par Google." });

    this.currency.reset();
    const currency = await this.currency.get();
    if (!currency.ok) return [...steps, failedStep(...ACCOUNT, currency.error.message, currency.error.code), ...remaining([PLANNER])];
    steps.push({ id: ACCOUNT[0], label: ACCOUNT[1], status: "ok", detail: `Compte accessible, devise ${currency.data}.` });

    const to = lastCompleteMonth(now);
    const metrics = await this.getKeywordMetrics({ terms: ["chaussettes"], country: "FR", language: "fr", from: addMonths(to, -11), to });
    if (!metrics.ok) {
      // The account answered, so a refusal here is almost always the access level: Explorer excludes Planning.
      const accessHint = metrics.error.code === "unauthorized" ? PLANNER_ACCESS_HINT : undefined;
      return [...steps, failedStep(...PLANNER, metrics.error.message, metrics.error.code, accessHint)];
    }
    const avg = metrics.data[0]?.avgMonthlySearches;
    steps.push({
      id: PLANNER[0],
      label: PLANNER[1],
      status: "ok",
      detail:
        typeof avg === "number"
          ? `Réponse reçue : ${avg.toLocaleString("fr-FR")} recherches par mois en moyenne pour « chaussettes » en France.`
          : "Réponse reçue, sans volume pour le terme de test.",
    });
    return steps;
  }
}

const PLANNER_ACCESS_HINT =
  "Compte accessible, mais Keyword Planner refusé : le projet Google Cloud du client OAuth n'a pas le niveau d'accès Basic. L'accès Explorer exclut les services de planification ; demande Basic (après vérification de la marque) sur la page Google Ads API de Google Cloud Console.";

function failedStep(id: string, label: string, message: string, code?: string, override?: string): ConnectionCheckStep {
  const reason = reasonOf(message);
  const hint = override ?? (reason ? GOOGLE_ADS_ERROR_HINTS[reason] : undefined);
  const fallback = code === "no_data" ? "Version de l'API ou ID de compte introuvable." : `Erreur renvoyée : ${message}`;
  return { id, label, status: "error", detail: hint ?? fallback, ...(reason ? { items: [`Code Google : ${reason}`] } : {}) };
}
