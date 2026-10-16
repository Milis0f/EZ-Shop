import { z } from "zod";
import type { SourceRef } from "@/domain/provenance";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import {
  fail,
  ok,
  type CountryTermsQuery,
  type ProviderMeta,
  type ProviderResult,
  type ProviderStatus,
  type SuggestionsObservation,
  type SuggestProvider,
} from "../contracts";
import { cacheKey, cached, httpJson } from "../http";

/**
 * Google Autocomplete — the suggestions shown under the search box, per country (gl) and language (hl).
 * Public endpoint, no key, NOT documented by Google as an API: it can change or be throttled.
 * Verified live on 2026-10-15 (FR and DE).
 */

const BASE_URL = "https://suggestqueries.google.com/complete/search";
const CACHE_TTL_SECONDS = 24 * 3600;
/** Two terms per country is enough to see intent and marketplaces without hammering the endpoint. */
const MAX_TERMS = 2;

export const googleAutocompleteMeta: ProviderMeta = {
  id: "google-autocomplete",
  name: "Google Autocomplete",
  category: "search_signals",
  authMode: "none",
  access: "open",
  docsUrl: "https://support.google.com/websearch/answer/7368877",
  qualityTier: 0.4,
  connectorVersion: "1.0.0",
  requiredEnv: [],
  coverage: { kind: "all" },
  verification: "live_verified",
  unofficial: true,
  notes: [
    "Recherches associées réellement tapées dans chaque pays (achat, avis, marques, marketplaces). Aucun volume.",
    "Point d'accès public non documenté par Google : peut changer sans préavis.",
  ],
};

const responseSchema = z.tuple([z.string(), z.array(z.string())]).rest(z.unknown());

export function parseSuggestions(payload: unknown): ProviderResult<string[]> {
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) return fail("invalid_response", "Google Autocomplete: unexpected response shape");
  return ok(parsed.data[1].map((s) => s.trim()).filter(Boolean));
}

export class GoogleAutocompleteProvider implements SuggestProvider {
  readonly meta = googleAutocompleteMeta;

  constructor(
    private readonly cache: ProviderCacheRepository,
    private readonly timeoutMs: number,
  ) {}

  status(): ProviderStatus {
    return { state: "ready", detail: "Accès public sans clé (non officiel)." };
  }

  async getSuggestions(query: CountryTermsQuery): Promise<ProviderResult<SuggestionsObservation>> {
    const terms = query.terms.slice(0, MAX_TERMS);
    if (terms.length === 0) return fail("no_data", "Google Autocomplete: no term");
    const results = await Promise.all(
      terms.map(async (term) => {
        const url = `${BASE_URL}?client=firefox&hl=${query.language}&gl=${query.country.toLowerCase()}&q=${encodeURIComponent(term)}`;
        const raw = await cached(
          this.cache,
          cacheKey(this.meta.id, url),
          this.meta.id,
          CACHE_TTL_SECONDS,
          () => httpJson(url, "Google Autocomplete", { timeoutMs: this.timeoutMs }),
          (payload) => parseSuggestions(payload).ok,
        );
        return raw.ok ? parseSuggestions(raw.data) : raw;
      }),
    );
    const failures = results.flatMap((r) => (r.ok ? [] : [r.error]));
    if (failures.length === results.length && failures[0]) return { ok: false, error: failures[0] };

    const suggestions = [...new Set(results.flatMap((r) => (r.ok ? r.data : [])).map((s) => s.toLocaleLowerCase(query.language)))];
    const source: SourceRef = {
      sourceId: this.meta.id,
      origin: "live",
      collectedAt: new Date().toISOString(),
      connectorVersion: this.meta.connectorVersion,
      queryRef: `suggest/${query.country}/${query.language}/${terms.join("|")}`,
      sourceUrl: "https://www.google.com",
      // Suggestions reflect current searches: the period is the collection day.
      period: { start: new Date().toISOString().slice(0, 10), end: new Date().toISOString().slice(0, 10) },
    };
    return ok({ suggestions, source });
  }
}
