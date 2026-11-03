import type { ProviderId } from "@/domain/provenance";
import type { ProviderResult } from "./contracts";
import type { ProviderSet } from "./registry";

/**
 * The smallest real business read for each source: what "Test now" runs and what the live
 * integration test runs. A read only, never a write; one call (two for the tariffs). The answer is
 * judged on its content: an empty but well-formed answer is "empty", not a failure.
 */

export interface Probe {
  readonly run: () => Promise<ProviderResult<unknown>>;
  /** Whether the answer holds what the analysis needs (rows, rates, a translation…). */
  readonly hasData: (data: unknown) => boolean;
}

const SAMPLE = { terms: ["gourde inox"], country: "FR" as const, language: "fr" as const };
const nonEmpty = (data: unknown): boolean => (Array.isArray(data) ? data.length > 0 : data !== null && typeof data === "object" && Object.keys(data).length > 0);

/** Last complete month, as the analyses query it. */
function lastMonth(now: Date): `${number}-${string}` {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function probeFor(set: ProviderSet, id: ProviderId, now = new Date()): Probe | null {
  const to = lastMonth(now);
  const from = `${Number(to.slice(0, 4)) - 1}-${to.slice(5)}` as `${number}-${string}`;
  const macro = set.macro.find((p) => p.meta.id === id);
  if (macro) return { run: () => macro.getIndicators(["FR", "DE", "US"]), hasData: nonEmpty };
  const tariff = set.tariffs.find((p) => p.meta.id === id);
  // A declarable heading on both tariffs: vacuum flasks (9617), duties from China.
  if (tariff) return { run: () => tariff.getDuties(tariff.regimes[0], "9617000000", "CN"), hasData: nonEmpty };
  const library = set.adLibraries.find((p) => p.meta.id === id);
  if (library) return { run: () => library.getAdActivity({ terms: SAMPLE.terms, country: "FR", since: `${from}-01` }), hasData: nonEmpty };
  const cost = set.adCosts.find((p) => p.meta.id === id);
  if (cost) return { run: () => cost.getCostEstimate({ terms: SAMPLE.terms, country: "FR" }), hasData: nonEmpty };

  switch (id) {
    case set.suggest.meta.id:
      return { run: () => set.suggest.getSuggestions(SAMPLE), hasData: nonEmpty };
    case set.topicInterest.meta.id:
      return { run: () => set.topicInterest.getTopicInterest({ terms: ["Bouteille isotherme"], language: "fr", from, to }), hasData: nonEmpty };
    case set.content.meta.id:
      return { run: () => set.content.getContent({ ...SAMPLE, publishedAfter: `${from}-01T00:00:00Z` }), hasData: nonEmpty };
    case set.marketplace.meta.id:
      return { run: () => set.marketplace.getListings(SAMPLE), hasData: nonEmpty };
    case set.sourcing.meta.id:
      return { run: () => set.sourcing.searchProducts({ terms: ["stainless steel water bottle"], shipTo: "FR" }), hasData: nonEmpty };
    case set.vat.meta.id:
      return { run: () => set.vat.getVatRates(["FR", "DE", "US"]), hasData: nonEmpty };
    case set.fx.meta.id:
      return { run: () => set.fx.getEurRates(), hasData: (d) => nonEmpty((d as { rates?: unknown }).rates) };
    case set.translator.meta.id:
      return { run: () => set.translator.translate("gourde inox", "fr", "en"), hasData: (d) => Boolean((d as { text?: string }).text) };
    case set.keywordMetrics.meta.id:
      return { run: () => set.keywordMetrics.getKeywordMetrics({ ...SAMPLE, from, to }), hasData: nonEmpty };
    case set.searchInterest.meta.id:
      return { run: () => set.searchInterest.getInterestOverTime({ terms: SAMPLE.terms, country: "FR", from, to }), hasData: nonEmpty };
    default:
      return null;
  }
}

/** One test's outcome, as kept and shown. Never an error message from the provider: a code only. */
export interface HealthResult {
  readonly id: ProviderId;
  /** ok: data came back; empty: a valid answer with nothing in it; failed: an error (see `code`). */
  readonly outcome: "ok" | "empty" | "failed";
  readonly code: string | null;
  readonly ms: number;
  readonly testedAt: string;
}

export async function runProbe(id: ProviderId, probe: Probe, now: () => number = Date.now): Promise<HealthResult> {
  const started = now();
  let outcome: HealthResult["outcome"] = "failed";
  let code: string | null = null;
  try {
    const result = await probe.run();
    if (result.ok) outcome = probe.hasData(result.data) ? "ok" : "empty";
    else code = result.error.code;
  } catch {
    code = "threw";
  }
  return { id, outcome, code, ms: Math.round(now() - started), testedAt: new Date().toISOString() };
}
