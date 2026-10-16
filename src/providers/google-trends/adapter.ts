import { getCountry } from "@/domain/country";
import type { ServerEnv } from "@/config/env";
import {
  fail,
  type ProviderMeta,
  type ProviderResult,
  type ProviderStatus,
  type SearchInterestProvider,
  type SearchInterestQuery,
  type TermInterestSeries,
} from "../contracts";

/**
 * Google Trends API (alpha) — access granted on application only.
 * https://developers.google.com/search/apis/trends
 *
 * TODO(google-trends): once alpha access is granted, implement getInterestOverTime:
 *   - request monthly interest for up to 5 terms, geo = ISO country code, 5-year window
 *   - map the response to TermInterestSeries (0–100 index, relative — never a volume)
 *   - add a recorded fixture + parser test, then set verification to "live_verified"
 * Unofficial scrapers (pytrends & co.) are deliberately NOT used: brittle and against ToS.
 */

export const googleTrendsMeta: ProviderMeta = {
  id: "google-trends",
  name: "Google Trends API (alpha)",
  category: "search_demand",
  authMode: "api_key",
  access: "approval",
  docsUrl: "https://developers.google.com/search/apis/trends",
  qualityTier: 0.85,
  connectorVersion: "0.0.0",
  requiredEnv: ["GOOGLE_TRENDS_API_KEY"],
  coverage: { kind: "all" },
  verification: "not_implemented",
  notes: [
    "Indice relatif 0–100 : donne la forme de la demande (tendance, saisonnalité), pas un volume.",
    "Accès alpha sur candidature ; format de réponse non public.",
  ],
};

export class GoogleTrendsProvider implements SearchInterestProvider {
  readonly meta = googleTrendsMeta;

  constructor(private readonly env: ServerEnv) {}

  status(): ProviderStatus {
    if (!this.env.GOOGLE_TRENDS_API_KEY) {
      return { state: "not_configured", detail: "Accès alpha requis : GOOGLE_TRENDS_API_KEY absent." };
    }
    return { state: "not_implemented", detail: "Clé présente, mais le mapping de réponse alpha n'est pas encore codé." };
  }

  async getInterestOverTime(query: SearchInterestQuery): Promise<ProviderResult<readonly TermInterestSeries[]>> {
    const state = this.status();
    const country = getCountry(query.country).nameFr;
    if (state.state === "not_configured") return fail("not_configured", `Google Trends non configuré (${country}).`);
    return fail("not_implemented", "Google Trends : connecteur alpha à implémenter (voir TODO).");
  }
}
