import { z } from "zod";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import { fail, ok, type FxProvider, type FxRates, type ProviderMeta, type ProviderResult, type ProviderStatus } from "../contracts";
import { cacheKey, cached, httpJson } from "../http";

/**
 * Euro reference rates straight from the ECB Data Portal (official, open, no key), dataset EXR, daily
 * spot series against the euro. Verified live on 2026-11-03. Until then the rates came through
 * Frankfurter, a third-party mirror: the official source gives the same figures with their own provenance.
 * https://data.ecb.europa.eu/help/api/data
 * The ECB publishes once per working day, around 16:00 CET; currencies it stopped quoting are left out.
 */

const URL = "https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?lastNObservations=1&format=jsondata";
const CACHE_TTL_SECONDS = 12 * 3600;

export const ecbFxMeta: ProviderMeta = {
  id: "ecb-fx",
  name: "Taux de change de référence BCE",
  category: "reference",
  authMode: "none",
  access: "open",
  docsUrl: "https://data.ecb.europa.eu/help/api/data",
  qualityTier: 0.95,
  connectorVersion: "2.0.0",
  requiredEnv: [],
  coverage: { kind: "all" },
  verification: "live_verified",
  maturity: "stable",
  lastVerifiedAt: "2026-11-03",
  termsUrl: "https://www.ecb.europa.eu/services/disclaimer/html/index.en.html",
  notes: ["Taux de référence quotidiens publiés par la Banque centrale européenne (portail de données officiel), pour convertir les prix en euros."],
};

/** SDMX-JSON 1.0 as the ECB Data Portal serves it: dimension values, then series keyed "0:i:0:0:0". */
const schema = z.object({
  dataSets: z.array(z.object({ series: z.record(z.string(), z.object({ observations: z.record(z.string(), z.array(z.union([z.number(), z.null()]))) })) })).min(1),
  structure: z.object({
    dimensions: z.object({
      series: z.array(z.object({ id: z.string(), values: z.array(z.object({ id: z.string() })) })),
      observation: z.array(z.object({ values: z.array(z.object({ id: z.string() })) })).min(1),
    }),
  }),
});

/** The latest day's rate of each currency still quoted on that day. */
export function parseEcbRates(payload: unknown): { date: string; rates: Record<string, number> } | null {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return null;
  const { dataSets, structure } = parsed.data;
  const position = structure.dimensions.series.findIndex((d) => d.id === "CURRENCY");
  const currencies = structure.dimensions.series[position]?.values ?? [];
  const dates = structure.dimensions.observation[0].values.map((v) => v.id);
  const latest = dates.toSorted().at(-1);
  if (position < 0 || !latest) return null;

  const rates: Record<string, number> = {};
  for (const [key, series] of Object.entries(dataSets[0].series)) {
    const currency = currencies[Number(key.split(":")[position])]?.id;
    for (const [index, values] of Object.entries(series.observations)) {
      const value = values[0];
      if (currency && dates[Number(index)] === latest && typeof value === "number" && value > 0) rates[currency] = value;
    }
  }
  return Object.keys(rates).length > 0 ? { date: latest, rates } : null;
}

export class EcbFxProvider implements FxProvider {
  readonly meta = ecbFxMeta;

  constructor(
    private readonly cache: ProviderCacheRepository,
    private readonly timeoutMs: number,
  ) {}

  status(): ProviderStatus {
    return { state: "ready", detail: "API ouverte, sans clé." };
  }

  async getEurRates(): Promise<ProviderResult<FxRates>> {
    const raw = await cached(
      this.cache,
      cacheKey(this.meta.id, URL),
      this.meta.id,
      CACHE_TTL_SECONDS,
      () => httpJson(URL, "ECB Data Portal", { timeoutMs: this.timeoutMs, headers: { Accept: "application/json" } }),
      (payload) => parseEcbRates(payload) !== null,
    );
    if (!raw.ok) return raw;
    const parsed = parseEcbRates(raw.data);
    if (!parsed) return fail("invalid_response", "ECB Data Portal: unexpected response shape");
    return ok({
      date: parsed.date,
      rates: { ...parsed.rates, EUR: 1 },
      source: {
        sourceId: this.meta.id,
        origin: "live",
        collectedAt: new Date().toISOString(),
        connectorVersion: this.meta.connectorVersion,
        queryRef: `EXR/D..EUR.SP00.A/${parsed.date}`,
        sourceUrl: "https://data.ecb.europa.eu/data/datasets/EXR",
        period: { start: parsed.date, end: parsed.date },
      },
    });
  }
}

/** Converts an amount in `currency` to EUR with ECB reference rates (1 EUR = rate × currency). */
export function toEur(amount: number, currency: string, fx: FxRates): number | null {
  const rate = fx.rates[currency.toUpperCase()];
  return rate ? amount / rate : null;
}
