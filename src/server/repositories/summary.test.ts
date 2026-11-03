import { describe, expect, it } from "vitest";
import type { CountryAnalysis } from "@/domain/analysis";
import { rankForSimple } from "@/engine/report/simple-summary";
import { verdictFor } from "@/engine/report/verdict";
import { mockStoredAnalysis } from "@/test/stored-analysis";
import { toSummary, type SummaryInput } from "./summary";

const base: SummaryInput = { id: "a", productName: "cap", status: "completed", dataMode: "live", countryCount: 1, createdAt: "2026-10-30T00:00:00.000Z", scores: [] };

describe("toSummary", () => {
  it("has no verdict without country results", () => {
    expect(toSummary(base).verdict).toBeUndefined();
    expect(toSummary({ ...base, results: [] }).verdict).toBeUndefined();
  });

  it("does not break on a result an older version stored", () => {
    expect(toSummary({ ...base, results: [{ country: "FR" } as unknown as CountryAnalysis] }).verdict).toBeUndefined();
  });

  it("opens on France, with the verdict its report states", async () => {
    const { countries } = await mockStoredAnalysis(["DE", "FR"], { currency: "EUR", sellingPrice: 29 });
    const france = countries.find((c) => c.country === "FR");
    if (!france) throw new Error("France expected");
    expect(toSummary({ ...base, results: countries }).verdict).toEqual({ value: verdictFor(france).value, country: "FR", confidence: france.scoring.confidence.score });
  });

  it("opens on the most promising country without France", async () => {
    const { countries } = await mockStoredAnalysis(["DE", "ES"], { currency: "EUR", sellingPrice: 29 });
    expect(toSummary({ ...base, results: countries }).verdict?.country).toBe(rankForSimple(countries)[0]?.country);
  });
});
