import { z } from "zod";
import { isCountryCode, type CountryCode } from "@/domain/country";
import type { SourceRef } from "@/domain/provenance";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import {
  fail,
  ok,
  type MacroBatch,
  type MacroIndicatorId,
  type MacroIndicatorProvider,
  type MacroObservation,
  type ProviderMeta,
  type ProviderResult,
  type ProviderStatus,
} from "../contracts";
import { cacheKey, cached, httpJson } from "../http";

/** World Bank Indicators API v2 — open, no key. Verified live on 2026-10-14. */

const BASE_URL = "https://api.worldbank.org/v2";
const CACHE_TTL_SECONDS = 7 * 24 * 3600;

const INDICATORS: ReadonlyArray<{ id: MacroIndicatorId; code: string }> = [
  { id: "population", code: "SP.POP.TOTL" },
  { id: "gdp_per_capita_ppp", code: "NY.GDP.PCAP.PP.CD" },
  { id: "internet_users_pct", code: "IT.NET.USER.ZS" },
];

export const worldBankMeta: ProviderMeta = {
  id: "world-bank",
  name: "World Bank Indicators",
  category: "macro",
  authMode: "none",
  access: "open",
  docsUrl: "https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation",
  qualityTier: 0.95,
  connectorVersion: "1.0.0",
  requiredEnv: [],
  coverage: { kind: "all" },
  verification: "live_verified",
  notes: [
    "Population, PIB par habitant PPA, part d'internautes. Dernière valeur non vide (mrnev=1).",
    "Données annuelles, souvent publiées avec 1 à 2 ans de décalage.",
  ],
};

const rowSchema = z.object({
  indicator: z.object({ id: z.string() }),
  country: z.object({ id: z.string() }),
  date: z.string(),
  value: z.number().nullable(),
});

const dataSchema = z.tuple([z.object({ total: z.number() }), z.array(rowSchema).nullable()]);
const errorSchema = z.tuple([z.object({ message: z.array(z.object({ id: z.string(), value: z.string() })) })]);
const responseSchema = z.union([dataSchema, errorSchema]);

/** The answer is the [paging, rows] pair (rows may be null), not the `[{ message }]` error form: safe to cache. */
export function isWorldBankData(payload: unknown): boolean {
  return dataSchema.safeParse(payload).success;
}

/** Pure parser: raw World Bank payload → observations for the requested countries. */
export function parseWorldBank(
  payload: unknown,
  indicator: MacroIndicatorId,
  sourceUrl: string,
  collectedAt: string,
): ProviderResult<MacroObservation[]> {
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) return fail("invalid_response", "World Bank: unexpected response shape");
  if (parsed.data.length === 1) return fail("upstream_error", `World Bank: ${parsed.data[0].message[0]?.value ?? "error"}`);

  const rows = parsed.data[1] ?? [];
  const observations = rows.flatMap((row): MacroObservation[] => {
    if (row.value === null || !isCountryCode(row.country.id)) return [];
    const source: SourceRef = {
      sourceId: "world-bank",
      origin: "live",
      collectedAt,
      connectorVersion: worldBankMeta.connectorVersion,
      queryRef: `indicator/${row.indicator.id}`,
      sourceUrl,
      period: { start: row.date, end: row.date },
    };
    return [{ country: row.country.id, indicator, value: row.value, source }];
  });
  return ok(observations);
}

export class WorldBankProvider implements MacroIndicatorProvider {
  readonly meta = worldBankMeta;
  readonly indicators = INDICATORS.map((i) => i.id);

  constructor(
    private readonly cache: ProviderCacheRepository,
    private readonly timeoutMs: number,
  ) {}

  status(): ProviderStatus {
    return { state: "ready", detail: "API ouverte, sans clé." };
  }

  async getIndicators(countries: readonly CountryCode[]): Promise<ProviderResult<MacroBatch>> {
    if (countries.length === 0) return ok({ observations: [], partialErrors: [] });
    const results = await Promise.all(INDICATORS.map((indicator) => this.fetchIndicator(indicator, countries)));
    const errors = results.flatMap((r) => (r.ok ? [] : [r.error]));
    if (errors.length === results.length && errors[0]) return { ok: false, error: errors[0] };
    return ok({ observations: results.flatMap((r) => (r.ok ? r.data : [])), partialErrors: errors });
  }

  private async fetchIndicator(
    indicator: (typeof INDICATORS)[number],
    countries: readonly CountryCode[],
  ): Promise<ProviderResult<MacroObservation[]>> {
    const url = `${BASE_URL}/country/${countries.join(";")}/indicator/${indicator.code}?format=json&mrnev=1&per_page=300`;
    const raw = await cached(
      this.cache,
      cacheKey(this.meta.id, url),
      this.meta.id,
      CACHE_TTL_SECONDS,
      () => httpJson(url, `World Bank ${indicator.code}`, { timeoutMs: this.timeoutMs }),
      isWorldBankData,
    );
    if (!raw.ok) return raw;
    return parseWorldBank(raw.data, indicator.id, url, new Date().toISOString());
  }
}
