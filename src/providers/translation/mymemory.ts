import { z } from "zod";
import type { LanguageCode } from "@/domain/country";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import { fail, ok, type ProviderMeta, type ProviderResult, type ProviderStatus, type TranslationProvider } from "../contracts";
import { cacheKey, cached, httpJson } from "../http";

/**
 * MyMemory translation API — open, no key (free anonymous quota: a few thousand characters per day,
 * plenty for product names). Verified live on 2026-10-15 (fr → en, de, es, it, pl, sv).
 * Used only to translate the product name into the languages of the analysed countries; every
 * translated term is tagged "machine" and the user's own translations always take precedence.
 */

const URL = "https://api.mymemory.translated.net/get";
const CACHE_TTL_SECONDS = 90 * 24 * 3600;
/** Below this MyMemory match score, the translation is too uncertain to query markets with. */
const MIN_MATCH = 0.5;

export const myMemoryMeta: ProviderMeta = {
  id: "mymemory",
  name: "Traduction automatique (MyMemory)",
  category: "reference",
  authMode: "none",
  access: "open",
  docsUrl: "https://mymemory.translated.net/doc/spec.php",
  qualityTier: 0.6,
  connectorVersion: "1.0.0",
  requiredEnv: [],
  coverage: { kind: "all" },
  verification: "live_verified",
  notes: ["Traduit le nom du produit dans la langue de chaque pays analysé ; tes propres traductions restent prioritaires."],
};

const schema = z.object({
  responseStatus: z.union([z.number(), z.string()]),
  quotaFinished: z.boolean().nullable().optional(),
  responseData: z.object({ translatedText: z.string(), match: z.union([z.number(), z.string()]).optional() }),
});

export function parseMyMemory(payload: unknown): ProviderResult<{ text: string; match: number }> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return fail("invalid_response", "MyMemory: unexpected response shape");
  const { responseStatus, quotaFinished, responseData } = parsed.data;
  if (quotaFinished || /MYMEMORY WARNING/i.test(responseData.translatedText)) return fail("rate_limited", "MyMemory: quota du jour atteint", true);
  if (Number(responseStatus) !== 200) return fail("upstream_error", `MyMemory: status ${String(responseStatus)}`);
  const text = responseData.translatedText.trim();
  const match = Number(responseData.match ?? 0);
  if (!text) return fail("no_data", "MyMemory: traduction vide");
  if (match < MIN_MATCH) return fail("no_data", `MyMemory: traduction trop incertaine (${match})`);
  return ok({ text, match });
}

/**
 * Whether an answer may be cached: a translation, or a stable "no usable translation" (empty or too
 * uncertain). A quota warning or a non-200 status is transient and must be asked again.
 */
export function isCacheableTranslation(payload: unknown): boolean {
  const parsed = parseMyMemory(payload);
  return parsed.ok || parsed.error.code === "no_data";
}

export class MyMemoryProvider implements TranslationProvider {
  readonly meta = myMemoryMeta;

  constructor(
    private readonly cache: ProviderCacheRepository,
    private readonly timeoutMs: number,
  ) {}

  status(): ProviderStatus {
    return { state: "ready", detail: "API ouverte, sans clé." };
  }

  async translate(text: string, from: LanguageCode, to: LanguageCode): Promise<ProviderResult<{ text: string; match: number }>> {
    if (from === to) return ok({ text, match: 1 });
    const url = `${URL}?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
    const raw = await cached(
      this.cache,
      cacheKey(this.meta.id, url),
      this.meta.id,
      CACHE_TTL_SECONDS,
      () => httpJson(url, "MyMemory", { timeoutMs: this.timeoutMs }),
      isCacheableTranslation,
    );
    return raw.ok ? parseMyMemory(raw.data) : raw;
  }
}
