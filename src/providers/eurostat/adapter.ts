import { z } from "zod";
import { COUNTRIES, type CountryCode } from "@/domain/country";
import type { SourceRef } from "@/domain/provenance";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import {
  fail,
  isCovered,
  ok,
  type MacroBatch,
  type MacroIndicatorProvider,
  type MacroObservation,
  type ProviderMeta,
  type ProviderResult,
  type ProviderStatus,
} from "../contracts";
import { cacheKey, cached, httpJson } from "../http";

/**
 * Eurostat dissemination API (JSON-stat 2.0) — open, no key. Verified live on 2026-10-14.
 * Indicator: share of individuals who bought online in the last 12 months
 * (dataset isoc_ec_ib20, indic_is=I_BLT12, unit=PC_IND, ind_type=IND_TOTAL).
 */

const BASE_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
const DATASET = "isoc_ec_ib20";
const CACHE_TTL_SECONDS = 7 * 24 * 3600;
const LOOKBACK_YEARS = 4;

/** Eurostat uses non-ISO codes for a few countries. */
const EUROSTAT_GEO: Partial<Record<CountryCode, string>> = { GB: "UK" };

export const eurostatMeta: ProviderMeta = {
  id: "eurostat",
  name: "Eurostat",
  category: "macro",
  authMode: "none",
  access: "open",
  docsUrl: "https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-introduction",
  qualityTier: 0.95,
  connectorVersion: "1.0.0",
  requiredEnv: [],
  coverage: {
    kind: "list",
    countries: (Object.values(COUNTRIES).filter((c) => c.isEU || c.code === "CH").map((c) => c.code)),
    note: "UE + Suisse (séries partielles). Royaume-Uni absent depuis le Brexit.",
  },
  verification: "live_verified",
  notes: ["Part des individus ayant acheté en ligne sur les 12 derniers mois (isoc_ec_ib20, I_BLT12)."],
};

const jsonStatSchema = z.object({
  id: z.array(z.string()),
  size: z.array(z.number().int()),
  value: z.record(z.string(), z.number().nullable()),
  dimension: z.record(
    z.string(),
    z.object({ category: z.object({ index: z.record(z.string(), z.number().int()) }) }),
  ),
});

/** Pure parser: latest available value per geo from a JSON-stat 2.0 dataset. */
export function parseEurostat(
  payload: unknown,
  requested: readonly CountryCode[],
  sourceUrl: string,
  collectedAt: string,
): ProviderResult<MacroObservation[]> {
  const parsed = jsonStatSchema.safeParse(payload);
  if (!parsed.success) return fail("invalid_response", "Eurostat: unexpected JSON-stat shape");
  const { id, size, value, dimension } = parsed.data;

  const geoPos = id.indexOf("geo");
  const timePos = id.indexOf("time");
  if (geoPos < 0 || timePos < 0) return fail("invalid_response", "Eurostat: missing geo/time dimensions");

  // Row-major strides; every other dimension is filtered to a single category.
  const strides = size.map((_, i) => size.slice(i + 1).reduce((a, b) => a * b, 1));
  const geoIndex = dimension.geo?.category.index ?? {};
  const timeEntries = Object.entries(dimension.time?.category.index ?? {}).toSorted((a, b) => b[0].localeCompare(a[0]));

  const observations = requested.flatMap((country): MacroObservation[] => {
    const geoCode = EUROSTAT_GEO[country] ?? country;
    const gi = geoIndex[geoCode];
    if (gi === undefined) return [];
    for (const [year, ti] of timeEntries) {
      const v = value[String(gi * strides[geoPos] + ti * strides[timePos])];
      if (typeof v === "number") {
        const source: SourceRef = {
          sourceId: "eurostat",
          origin: "live",
          collectedAt,
          connectorVersion: eurostatMeta.connectorVersion,
          queryRef: `${DATASET}/I_BLT12/${geoCode}`,
          sourceUrl,
          period: { start: year, end: year },
        };
        return [{ country, indicator: "online_buyers_pct", value: v, source }];
      }
    }
    return [];
  });
  return ok(observations);
}

export class EurostatProvider implements MacroIndicatorProvider {
  readonly meta = eurostatMeta;
  readonly indicators = ["online_buyers_pct"] as const;

  constructor(
    private readonly cache: ProviderCacheRepository,
    private readonly timeoutMs: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  status(): ProviderStatus {
    return { state: "ready", detail: "API ouverte, sans clé." };
  }

  async getIndicators(countries: readonly CountryCode[]): Promise<ProviderResult<MacroBatch>> {
    const covered = countries.filter((c) => isCovered(this.meta, c));
    if (covered.length === 0) return ok({ observations: [], partialErrors: [] });

    const geos = covered.map((c) => `geo=${EUROSTAT_GEO[c] ?? c}`).join("&");
    const since = this.now().getUTCFullYear() - LOOKBACK_YEARS;
    const url = `${BASE_URL}/${DATASET}?${geos}&ind_type=IND_TOTAL&indic_is=I_BLT12&unit=PC_IND&sinceTimePeriod=${since}&lang=EN`;

    const raw = await cached(this.cache, cacheKey(this.meta.id, url), this.meta.id, CACHE_TTL_SECONDS, () =>
      httpJson(url, `Eurostat ${DATASET}`, { timeoutMs: this.timeoutMs }),
    );
    if (!raw.ok) return raw;
    const parsed = parseEurostat(raw.data, covered, url, new Date().toISOString());
    return parsed.ok ? ok({ observations: parsed.data, partialErrors: [] }) : parsed;
  }
}
