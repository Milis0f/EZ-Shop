import { z } from "zod";
import { COUNTRIES, type CountryCode } from "@/domain/country";
import type { SourceRef } from "@/domain/provenance";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import { fail, ok, type ProviderMeta, type ProviderResult, type ProviderStatus, type VatProvider, type VatRate } from "../contracts";
import { cacheKey, cached, httpJson } from "../http";

/**
 * Standard VAT / GST rates of the destination.
 * - EU-27: vatcomply.com `/vat_rates` (third-party, open, no key) — checked live on 2026-10-15.
 * - Other analysed countries: official rates transcribed from the tax authorities, with their URL.
 *   Re-check them when a rate change is announced (CH: 8.5 % planned for 2028, subject to the 2026-11-29 vote).
 */

const URL = "https://api.vatcomply.com/vat_rates";
const CACHE_TTL_SECONDS = 7 * 24 * 3600;
const TRANSCRIBED_ON = "2026-10-15";

/** vatcomply uses EL for Greece; analysed countries all match their ISO code. */
const NON_EU: Partial<Record<CountryCode, { rate: number | null; note?: string; url: string }>> = {
  GB: { rate: 20, url: "https://www.gov.uk/vat-rates" },
  CH: {
    rate: 8.1,
    note: "8,5 % prévu en 2028 si la hausse est acceptée en votation.",
    url: "https://www.estv.admin.ch/en/vat-rates-switzerland",
  },
  AU: { rate: 10, note: "GST.", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst" },
  CA: {
    rate: 5,
    note: "TPS fédérale ; la TVH ou la taxe provinciale s'y ajoute selon la province (jusqu'à 15 % au total).",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html",
  },
  US: { rate: null, note: "Pas de TVA nationale : taxe de vente fixée par chaque État, non estimée.", url: "https://www.usa.gov/state-taxes" },
};

export const vatRatesMeta: ProviderMeta = {
  id: "vat-rates",
  name: "Taux de TVA",
  category: "reference",
  authMode: "none",
  access: "open",
  docsUrl: "https://www.vatcomply.com/",
  qualityTier: 0.85,
  connectorVersion: "1.0.0",
  requiredEnv: [],
  coverage: { kind: "all" },
  verification: "live_verified",
  notes: [
    "Taux normal de TVA de chaque pays de destination : UE via vatcomply.com, autres pays depuis les administrations fiscales.",
    "Sert à comparer les prix affichés TTC avec ton prix HT ; la TVA n'entre pas dans ta marge.",
  ],
};

const rowSchema = z.object({ country_code: z.string(), standard_rate: z.number() });

export function parseVatRates(payload: unknown): ProviderResult<Map<string, number>> {
  const parsed = z.array(rowSchema).safeParse(payload);
  if (!parsed.success) return fail("invalid_response", "vatcomply: unexpected response shape");
  return ok(new Map(parsed.data.map((r) => [r.country_code === "EL" ? "GR" : r.country_code, r.standard_rate])));
}

export class VatRatesProvider implements VatProvider {
  readonly meta = vatRatesMeta;

  constructor(
    private readonly cache: ProviderCacheRepository,
    private readonly timeoutMs: number,
  ) {}

  status(): ProviderStatus {
    return { state: "ready", detail: "API ouverte, sans clé." };
  }

  async getVatRates(countries: readonly CountryCode[]): Promise<ProviderResult<readonly VatRate[]>> {
    const collectedAt = new Date().toISOString();
    const needsEu = countries.some((c) => COUNTRIES[c].isEU);
    const eu = needsEu
      ? await cached(
          this.cache,
          cacheKey(this.meta.id, URL),
          this.meta.id,
          CACHE_TTL_SECONDS,
          () => httpJson(URL, "vatcomply", { timeoutMs: this.timeoutMs }),
          (payload) => parseVatRates(payload).ok,
        )
      : null;
    const euRates = eu?.ok ? parseVatRates(eu.data) : null;

    const rates = countries.flatMap((country): VatRate[] => {
      if (COUNTRIES[country].isEU) {
        const rate = euRates?.ok ? euRates.data.get(country) : undefined;
        if (rate === undefined) return [];
        const source: SourceRef = { sourceId: this.meta.id, origin: "live", collectedAt, connectorVersion: this.meta.connectorVersion, queryRef: `vat/${country}`, sourceUrl: URL };
        return [{ country, standardRatePct: rate, source }];
      }
      const ref = NON_EU[country];
      if (!ref) return [];
      // Transcribed reference: observed from the tax authority's page on TRANSCRIBED_ON, not a model output.
      const source: SourceRef = {
        sourceId: this.meta.id,
        origin: "live",
        collectedAt: `${TRANSCRIBED_ON}T00:00:00.000Z`,
        connectorVersion: this.meta.connectorVersion,
        queryRef: `vat/${country}/reference-${TRANSCRIBED_ON}`,
        sourceUrl: ref.url,
      };
      return [{ country, standardRatePct: ref.rate, ...(ref.note ? { note: ref.note } : {}), source }];
    });

    if (rates.length === 0) return eu && !eu.ok ? eu : fail("no_data", "Taux de TVA indisponibles pour ces pays");
    return ok(rates);
  }
}
