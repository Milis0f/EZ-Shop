import { COUNTRIES, type CountryCode } from "@/domain/country";
import type { SourceRef } from "@/domain/provenance";
import { addMonths, toYearMonth } from "@/domain/time";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import {
  fail,
  ok,
  type MacroBatch,
  type MacroIndicatorProvider,
  type MacroObservation,
  type ProviderMeta,
  type ProviderResult,
  type ProviderStatus,
} from "../contracts";
import { cacheKey, cached, httpText } from "../http";

/**
 * OECD SDMX REST API — open, no key. Verified live on 2026-10-14.
 * Consumer confidence indicator, amplitude adjusted (long-term average = 100):
 * dataflow OECD.SDD.STES,DSD_STES@DF_CLI,4.1 — key {ISO3}.M.CCICP.IX._Z.AA.IX._Z.H
 *
 * NOTE: on 2026-10-14 the JSON and CSV serializers returned HTTP 500 while SDMX-ML
 * (generic XML) worked, hence the XML parser below.
 */

const DATAFLOW = "OECD.SDD.STES,DSD_STES@DF_CLI,4.1";
const KEY_SUFFIX = "M.CCICP.IX._Z.AA.IX._Z.H";
const BASE_URL = "https://sdmx.oecd.org/public/rest/data";
const CACHE_TTL_SECONDS = 24 * 3600;
const LOOKBACK_MONTHS = 6;

export const oecdMeta: ProviderMeta = {
  id: "oecd",
  name: "OECD Data (SDMX)",
  category: "macro",
  authMode: "none",
  access: "open",
  docsUrl: "https://www.oecd.org/en/data/insights/data-explainers/2024/09/api.html",
  qualityTier: 0.9,
  connectorVersion: "1.0.0",
  requiredEnv: [],
  coverage: {
    kind: "list",
    countries: Object.values(COUNTRIES).filter((c) => c.isOECD).map((c) => c.code),
    note: "Pays membres de l'OCDE.",
  },
  verification: "live_verified",
  notes: ["Indicateur de confiance des consommateurs (CCI), ajusté en amplitude, moyenne long terme = 100."],
};

const ISO3_TO_ISO2 = new Map(Object.values(COUNTRIES).map((c) => [c.iso3, c.code]));

/** Pure parser: SDMX-ML 2.1 GenericData → latest observation per country. */
export function parseOecdGenericXml(
  xml: string,
  sourceUrl: string,
  collectedAt: string,
): ProviderResult<MacroObservation[]> {
  if (!xml.includes("GenericData")) return fail("invalid_response", "OECD: response is not SDMX-ML GenericData");

  const latest = new Map<CountryCode, { period: string; value: number }>();
  for (const series of xml.matchAll(/<generic:Series>([\s\S]*?)<\/generic:Series>/g)) {
    const body = series[1];
    const area = /<generic:Value id="REF_AREA" value="([A-Z]{3})"/.exec(body)?.[1];
    const country = area ? ISO3_TO_ISO2.get(area) : undefined;
    if (!country) continue;
    for (const obs of body.matchAll(
      /<generic:ObsDimension id="TIME_PERIOD" value="([^"]+)"\s*\/>\s*<generic:ObsValue value="([^"]+)"/g,
    )) {
      const value = Number(obs[2]);
      const current = latest.get(country);
      if (Number.isFinite(value) && (!current || obs[1] > current.period)) {
        latest.set(country, { period: obs[1], value });
      }
    }
  }

  const observations = [...latest.entries()].map(([country, { period, value }]): MacroObservation => {
    const source: SourceRef = {
      sourceId: "oecd",
      origin: "live",
      collectedAt,
      connectorVersion: oecdMeta.connectorVersion,
      queryRef: `${DATAFLOW}/CCICP/${COUNTRIES[country].iso3}`,
      sourceUrl,
      period: { start: period, end: period },
    };
    return { country, indicator: "consumer_confidence", value, source };
  });
  return ok(observations);
}

export class OecdProvider implements MacroIndicatorProvider {
  readonly meta = oecdMeta;
  readonly indicators = ["consumer_confidence"] as const;

  constructor(
    private readonly cache: ProviderCacheRepository,
    private readonly timeoutMs: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  status(): ProviderStatus {
    return { state: "ready", detail: "API ouverte, sans clé." };
  }

  async getIndicators(countries: readonly CountryCode[]): Promise<ProviderResult<MacroBatch>> {
    const areas = countries.filter((c) => COUNTRIES[c].isOECD).map((c) => COUNTRIES[c].iso3);
    if (areas.length === 0) return ok({ observations: [], partialErrors: [] });

    const start = addMonths(toYearMonth(this.now()), -LOOKBACK_MONTHS);
    const url = `${BASE_URL}/${DATAFLOW}/${areas.join("+")}.${KEY_SUFFIX}?startPeriod=${start}`;
    const raw = await cached(this.cache, cacheKey(this.meta.id, url), this.meta.id, CACHE_TTL_SECONDS, () =>
      httpText(url, "OECD CCI", { timeoutMs: this.timeoutMs, headers: { Accept: "*/*" } }),
    );
    if (!raw.ok) return raw;
    const parsed = parseOecdGenericXml(raw.data, url, new Date().toISOString());
    return parsed.ok ? ok({ observations: parsed.data, partialErrors: [] }) : parsed;
  }
}
