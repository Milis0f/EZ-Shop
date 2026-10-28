import "server-only";
import { connectorFields, validateEnvValue } from "@/config/connector-fields";
import { getEnv } from "@/config/env";
import type { ProviderId } from "@/domain/provenance";
import type { Locale } from "@/i18n/config";
import { t } from "@/i18n/translate";
import { checkMessages } from "@/providers/check-messages";
import { AliExpressProvider, aliexpressMeta } from "@/providers/aliexpress/adapter";
import type { ConnectionCheckStep, ConnectionTestable, ProviderMeta } from "@/providers/contracts";
import { EbayBrowseProvider, ebayMeta } from "@/providers/ebay/adapter";
import { GoogleAdsKeywordPlannerProvider, googleAdsMeta } from "@/providers/google-ads/adapter";
import { YouTubeProvider, youtubeMeta } from "@/providers/youtube/adapter";
import type { ProviderCacheRepository } from "./repositories/types";

/**
 * Checks the saved values locally first (all format problems at once, without any network call),
 * then asks the connector to try them against the real API.
 */
export function formatStep(meta: Pick<ProviderMeta, "id" | "requiredEnv">, locale: Locale): ConnectionCheckStep {
  const m = checkMessages(locale);
  const problems = connectorFields(meta, locale).flatMap((field) => {
    const value = process.env[field.name]?.trim();
    if (!value) return field.optional ? [] : [t(m.missingValue, { label: field.label })];
    const checked = validateEnvValue(field, value, locale);
    return checked.ok ? [] : [t(m.problem, { label: field.label, error: checked.error })];
  });
  return problems.length === 0
    ? { id: "format", label: m.format, status: "ok", detail: m.formatOk }
    : { id: "format", label: m.format, status: "error", detail: m.formatError, items: problems };
}

/** Tests never read or write the analysis cache: they must reach the API with the current values. */
const NO_CACHE: ProviderCacheRepository = { get: async () => null, set: async () => undefined };

function testable(providerId: ProviderId): { meta: ProviderMeta; provider: ConnectionTestable } | null {
  const env = getEnv();
  const timeout = env.PROVIDER_HTTP_TIMEOUT_MS;
  switch (providerId) {
    case "google-ads-keyword-planner":
      return { meta: googleAdsMeta, provider: new GoogleAdsKeywordPlannerProvider(env, timeout) };
    case "youtube-data":
      return { meta: youtubeMeta, provider: new YouTubeProvider(env, NO_CACHE, timeout) };
    case "ebay-browse":
      return { meta: ebayMeta, provider: new EbayBrowseProvider(env, NO_CACHE, timeout) };
    case "aliexpress-affiliate":
      return { meta: aliexpressMeta, provider: new AliExpressProvider(env, NO_CACHE, timeout) };
    default:
      return null;
  }
}

export async function checkConnector(providerId: ProviderId, locale: Locale, now = new Date()): Promise<ConnectionCheckStep[] | null> {
  const target = testable(providerId);
  if (!target) return null;
  return [formatStep(target.meta, locale), ...(await target.provider.diagnose(now, locale))];
}
