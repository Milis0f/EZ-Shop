import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AnalysisResult, CountryAnalysis } from "@/domain/analysis";
import { sourceJournal } from "@/engine/report/source-journal";
import { verdictFor, type Verdict } from "@/engine/report/verdict";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { mockStoredAnalysis } from "@/test/stored-analysis";
import { verdictReasons } from "./reason-pills";
import { SimpleReport } from "./simple-report";
import { missingSources } from "./source-journal";

/** A row stored before the V1 fields existed: no margin datums, and the oldest rows have no signals at all. */
function preV1(analysis: AnalysisResult, dropSignals: boolean): AnalysisResult {
  const countries = analysis.countries.map((c): CountryAnalysis => {
    const copy: { -readonly [K in keyof CountryAnalysis]: CountryAnalysis[K] } = { ...c };
    if (dropSignals || !c.signals) delete copy.signals;
    else {
      const signals: { -readonly [K in keyof NonNullable<CountryAnalysis["signals"]>]: NonNullable<CountryAnalysis["signals"]>[K] } = { ...c.signals };
      delete signals.landedUnitCostEur;
      delete signals.marginAtPlannedPrice;
      delete signals.minPriceForTargetMargin;
      copy.signals = signals;
    }
    return copy;
  });
  const copy: { -readonly [K in keyof AnalysisResult]: AnalysisResult[K] } = { ...analysis, countries, economics: { currency: "EUR", landedCost: 9 } };
  delete copy.sourcing;
  delete copy.classification;
  return copy;
}

const render = (analysis: AnalysisResult, locale: Locale = "fr") =>
  // eslint-disable-next-line react/no-children-prop -- a .ts test has no JSX.
  renderToStaticMarkup(createElement(LocaleProvider, { locale, children: createElement(SimpleReport, { analysis }) }));

describe("SimpleReport", () => {
  it("renders a pre-V1 analysis", async () => {
    const stored = preV1(await mockStoredAnalysis(["FR", "DE"]), false);
    const oldest = preV1(stored, true);
    for (const analysis of [stored, oldest]) {
      for (const c of analysis.countries) expect(verdictFor(c).method).toBe("verdict_v1");
      expect(Array.isArray(sourceJournal(analysis))).toBe(true);
      const html = render(analysis);
      expect(html).toContain("Chaussettes chauffantes");
      expect(html).toContain("Confiance");
      expect(html).toContain("Pays par pays");
      // Prices were entered, but the margin was never computed for this row: said, not invented.
      expect(html).toContain("Ta marge");
      expect(html).toContain("DATA_INSUFFICIENT");
    }
  });

  it("renders in English and Spanish without the French copy", async () => {
    const analysis = preV1(await mockStoredAnalysis(["FR", "DE"]), false);
    const en = render(analysis, "en");
    expect(en).toContain("Confidence");
    expect(en).toContain("Country by country");
    expect(en).toContain("Your margin");
    expect(en).toContain("DATA_INSUFFICIENT");
    expect(en).not.toMatch(/Pays par pays|Ta marge|Confiance|Nouvelle analyse/);
    const es = render(analysis, "es");
    expect(es).toContain("País por país");
    expect(es).toContain("Tu margen");
    expect(es).not.toMatch(/Pays par pays|Ta marge|Confiance /);
  });

  it("puts the blocking factors first, in the verdict colour", () => {
    const loss = { code: "loss_at_planned_price", marginPct: -12, dutyIncluded: false } as const;
    const below = { code: "below_target_margin", targetMarginPct: 60, exVatEur: 27.5, inclVatEur: null } as const;
    const blocking = [
      { id: "loss_at_planned_price", cause: loss, message: "" },
      { id: "below_target_margin", cause: below, message: "" },
    ] as const;
    const peak = { code: "seasonal_peak", months: [5] } as const;
    const verdict: Verdict = { value: "non", label: "NON", cause: loss, reason: "", blocking, signals: [peak], supporting: [], method: "verdict_v1" };
    expect(verdictReasons(verdict, "fr").map(({ code, decisive }) => ({ code, decisive }))).toEqual([
      { code: "loss_at_planned_price", decisive: true },
      { code: "below_target_margin", decisive: true },
      { code: "seasonal_peak", decisive: false },
    ]);
    expect(verdictReasons(verdict, "fr")[2]!.text).toBe("Pic en mai.");
    expect(verdictReasons(verdict, "en")[2]!.text).toBe("Peak in May.");
    const mixed = { code: "mixed_signals", best: null, worst: null } as const;
    expect(verdictReasons({ ...verdict, value: "surveiller", label: "À SURVEILLER", cause: mixed, blocking: [] }, "es")[0]).toEqual({
      code: "mixed_signals",
      text: "Señales mixtas.",
      decisive: true,
    });
  });

  it("lists missing sources by score weight, never a source that was used", async () => {
    const analysis = await mockStoredAnalysis(["FR"]);
    const c = analysis.countries[0]!;
    const sources = missingSources(c, sourceJournal(analysis));
    for (let i = 1; i < sources.length; i++) expect(sources[i - 1]!.weight).toBeGreaterThanOrEqual(sources[i]!.weight);
    const used = missingSources(c, [{ providerId: sources[0]?.providerId ?? "google-trends", name: "x", countries: ["FR"], status: "used" }]);
    expect(used.some((s) => s.providerId === (sources[0]?.providerId ?? "google-trends"))).toBe(false);
  });
});
