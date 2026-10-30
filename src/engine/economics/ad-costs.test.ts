import { describe, expect, it } from "vitest";
import { buildAssumptions } from "@/config/assumptions";
import { insufficient, isKnown, observed, type Datum } from "@/domain/datum";
import { createRng } from "@/lib/random";
import type { FxRates } from "@/providers/contracts";
import { kpDatum, syntheticSeries, testSource } from "@/test/fixtures";
import { estimateAdCosts } from "./ad-costs";

const series = syntheticSeries({ months: 24, base: 5_000, annualGrowth: 0.1, amplitude: 0.2, peakMonth: 12 });
const none = insufficient("indisponible", ["x"]);
const rates = (r: Record<string, number>): Datum<FxRates> => observed({ rates: r, date: "2026-10-28", source: testSource("ecb-fx") } as unknown as FxRates, "none", [testSource("ecb-fx")]);

function googleCpc(extra: Parameters<typeof kpDatum>[1], fx: Datum<FxRates>) {
  const [google] = estimateAdCosts({ keywordMetrics: kpDatum(series, extra), meta: none, tiktok: none, fx }, buildAssumptions(), createRng("cpc"));
  return google!.cpc;
}

const p50 = (d: ReturnType<typeof googleCpc>): number => {
  if (!isKnown(d)) throw new Error(`not known: ${d.reason}`);
  return d.value.p50;
};

describe("Google CPC", () => {
  it("converts an account in dollars to euros", () => {
    const eur = p50(googleCpc({ lowTopOfPageBid: 0.5, highTopOfPageBid: 1.5, currency: "EUR" }, rates({})));
    const usd = p50(googleCpc({ lowTopOfPageBid: 0.5, highTopOfPageBid: 1.5, currency: "USD" }, rates({ USD: 1.25 })));
    expect(usd / eur).toBeCloseTo(0.8, 1);
  });

  it("handles a currency with very different units", () => {
    const eur = p50(googleCpc({ lowTopOfPageBid: 0.5, highTopOfPageBid: 1.5, currency: "EUR" }, rates({})));
    const jpy = p50(googleCpc({ lowTopOfPageBid: 80, highTopOfPageBid: 240, currency: "JPY" }, rates({ JPY: 160 })));
    expect(jpy / eur).toBeCloseTo(1, 1);
  });

  it("says so when the rate is unknown, and shows no amount", () => {
    expect(googleCpc({ currency: "USD" }, rates({ GBP: 0.8 }))).toMatchObject({ status: "DATA_INSUFFICIENT", missing: ["ecb-fx"] });
    expect(googleCpc({ currency: "USD" }, none)).toMatchObject({ status: "DATA_INSUFFICIENT", missing: ["ecb-fx"] });
  });

  it("needs no rate for an account in euros", () => {
    expect(isKnown(googleCpc({ currency: "EUR" }, none))).toBe(true);
  });

  it("centres on the average Google observed rather than on the bids", () => {
    const fromBids = p50(googleCpc({ lowTopOfPageBid: 0.5, highTopOfPageBid: 2 }, none));
    const fromAverage = googleCpc({ lowTopOfPageBid: 0.5, highTopOfPageBid: 2, averageCpc: 0.4 }, none);
    expect(fromBids).toBeGreaterThan(0.9);
    expect(p50(fromAverage)).toBeCloseTo(0.4, 1);
    if (!isKnown(fromAverage)) throw new Error("not known");
    expect(fromAverage.method).toBe("lognormal_from_average_cpc");
    expect(fromAverage.value.p10).toBeLessThan(fromAverage.value.p50);
    expect(fromAverage.value.p90).toBeGreaterThan(fromAverage.value.p50);
  });

  it("converts the average too", () => {
    expect(p50(googleCpc({ lowTopOfPageBid: 0.5, highTopOfPageBid: 2, averageCpc: 0.5, currency: "USD" }, rates({ USD: 1.25 })))).toBeCloseTo(0.4, 1);
  });
});
