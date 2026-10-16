import { z } from "zod";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import { fail, ok, type FxProvider, type FxRates, type ProviderMeta, type ProviderResult, type ProviderStatus } from "../contracts";
import { cacheKey, cached, httpJson } from "../http";

/**
 * ECB euro reference rates through the Frankfurter API (open, no key). Verified live on 2026-10-15.
 * Used to convert marketplace prices (GBP, USD, CHF…) to EUR. The ECB publishes once per working day.
 */

const URL = "https://api.frankfurter.dev/v1/latest?base=EUR";
const CACHE_TTL_SECONDS = 12 * 3600;

export const ecbFxMeta: ProviderMeta = {
  id: "ecb-fx",
  name: "Taux de change de référence BCE",
  category: "reference",
  authMode: "none",
  access: "open",
  docsUrl: "https://frankfurter.dev/",
  qualityTier: 0.95,
  connectorVersion: "1.0.0",
  requiredEnv: [],
  coverage: { kind: "all" },
  verification: "live_verified",
  notes: ["Taux de référence quotidiens de la Banque centrale européenne, pour convertir les prix en euros."],
};

const schema = z.object({ base: z.literal("EUR"), date: z.string(), rates: z.record(z.string(), z.number().positive()) });

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
    const raw = await cached(this.cache, cacheKey(this.meta.id, URL), this.meta.id, CACHE_TTL_SECONDS, () =>
      httpJson(URL, "Frankfurter (ECB)", { timeoutMs: this.timeoutMs }),
    );
    if (!raw.ok) return raw;
    const parsed = schema.safeParse(raw.data);
    if (!parsed.success) return fail("invalid_response", "Frankfurter: unexpected response shape");
    return ok({
      date: parsed.data.date,
      rates: { ...parsed.data.rates, EUR: 1 },
      source: {
        sourceId: this.meta.id,
        origin: "live",
        collectedAt: new Date().toISOString(),
        connectorVersion: this.meta.connectorVersion,
        queryRef: `latest/EUR/${parsed.data.date}`,
        sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
        period: { start: parsed.data.date, end: parsed.data.date },
      },
    });
  }
}

/** Converts an amount in `currency` to EUR with ECB reference rates (1 EUR = rate × currency). */
export function toEur(amount: number, currency: string, fx: FxRates): number | null {
  const rate = fx.rates[currency.toUpperCase()];
  return rate ? amount / rate : null;
}
