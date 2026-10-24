import { describe, expect, it } from "vitest";
import { buildAssumptions } from "@/config/assumptions";
import {
  ANALYSIS_SCHEMA_VERSION,
  type AnalysisResult,
  type CollectionIssue,
  type CountryAnalysis,
  type ProviderStatusSnapshot,
} from "@/domain/analysis";
import { insufficient, observed } from "@/domain/datum";
import type { SourceRef } from "@/domain/provenance";
import { analysisInputSchema } from "@/domain/schemas";
import { analyzeCountry } from "@/engine/analyze-country";
import { TEST_NOW, testSource } from "@/test/fixtures";
import { sourceJournal } from "./source-journal";

const none = (p: string) => insufficient(`${p} indisponible`, [p]);
const NOW_ISO = TEST_NOW.toISOString();

/** A real country result: only the autocomplete signal is known, everything else is missing. */
function country(code: "FR" | "DE", issues: CollectionIssue[], autocomplete: SourceRef | null = testSource("google-autocomplete")): CountryAnalysis {
  return analyzeCountry(
    {
      country: code,
      terms: [{ term: "chaussettes chauffantes", language: "fr", kind: "input", source: "user" }],
      languageMismatch: false,
      keywordMetrics: none("google-ads-keyword-planner"),
      searchInterest: none("google-trends"),
      adActivity: { meta: none("meta-ad-library"), tiktok: none("tiktok-commercial-content") },
      adCosts: { meta: none("meta-marketing-api"), tiktok: none("tiktok-business-api") },
      macro: {},
      language: "fr",
      v2: {
        suggestions: autocomplete
          ? observed({ suggestions: ["chaussettes chauffantes avis"], source: autocomplete }, "count", [autocomplete])
          : none("google-autocomplete"),
        content: none("youtube-data"),
        listings: none("ebay-browse"),
        topicInterest: none("wikimedia"),
        duties: none("uk-trade-tariff"),
        vat: none("vat-rates"),
      },
      issues,
    },
    { assumptions: buildAssumptions(), economics: { currency: "EUR" }, now: TEST_NOW, seed: "t", qualityOf: () => 0.4 },
  );
}

function analysis(countries: CountryAnalysis[], providers: ProviderStatusSnapshot[], extra: Partial<AnalysisResult> = {}): AnalysisResult {
  const input = analysisInputSchema.parse({ productName: "Chaussettes chauffantes", countries: countries.map((c) => c.country) });
  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    id: "a1",
    status: "completed",
    createdAt: NOW_ISO,
    completedAt: NOW_ISO,
    dataMode: "live",
    input,
    product: { canonicalKey: "chaussettes chauffantes", displayName: "Chaussettes chauffantes", inputLanguage: "fr", terms: [] },
    economics: { currency: "EUR" },
    assumptions: [],
    providers,
    countries,
    modelVersion: "test",
    ...extra,
  };
}

const snapshot = (providerId: ProviderStatusSnapshot["providerId"], state: ProviderStatusSnapshot["state"]): ProviderStatusSnapshot => ({
  providerId,
  state,
  detail: "",
});
const issue = (providerId: CollectionIssue["providerId"], code: string): CollectionIssue => ({ providerId, code, message: `${providerId} : ${code}` });

describe("source journal", () => {
  it("reports each provider as used, failed with its code, not configured or not implemented, per country", () => {
    const kpMissing = issue("google-ads-keyword-planner", "not_configured");
    const result = analysis(
      [country("FR", [issue("ebay-browse", "rate_limited")]), country("DE", [kpMissing])],
      [
        snapshot("google-autocomplete", "ready"),
        snapshot("ebay-browse", "ready"),
        snapshot("google-ads-keyword-planner", "not_configured"),
        snapshot("google-trends", "not_implemented"),
        snapshot("ecb-fx", "ready"),
      ],
    );

    expect(sourceJournal(result)).toEqual([
      { providerId: "google-trends", name: "Google Trends", countries: ["FR", "DE"], status: "not_implemented" },
      { providerId: "google-ads-keyword-planner", name: "Google Ads Keyword Planner", countries: ["FR", "DE"], status: "not_configured" },
      { providerId: "google-autocomplete", name: "Google Autocomplete", countries: ["FR", "DE"], status: "used", collectedAt: NOW_ISO },
      { providerId: "ebay-browse", name: "eBay Browse API", countries: ["FR"], status: "failed", errorCode: "rate_limited" },
    ]);
  });

  it("splits a provider into one row per outcome when countries differ", () => {
    const result = analysis([country("FR", []), country("DE", [issue("google-autocomplete", "timeout")], null)], []);

    expect(sourceJournal(result)).toEqual([
      { providerId: "google-autocomplete", name: "Google Autocomplete", countries: ["FR"], status: "used", collectedAt: NOW_ISO },
      { providerId: "google-autocomplete", name: "Google Autocomplete", countries: ["DE"], status: "failed", errorCode: "timeout" },
    ]);
  });

  it("dates a provider by its oldest collection, so a cached value never looks fresher than it is", () => {
    const cached = { ...testSource("google-autocomplete"), collectedAt: "2026-10-10T08:00:00.000Z" };
    const result = analysis([country("FR", []), country("DE", [], cached)], []);

    expect(sourceJournal(result)).toEqual([
      { providerId: "google-autocomplete", name: "Google Autocomplete", countries: ["FR", "DE"], status: "used", collectedAt: "2026-10-10T08:00:00.000Z" },
    ]);
  });

  it("never reports a development mock as a used provider", () => {
    const mock = { ...testSource("google-autocomplete"), origin: "mock" as const };
    const result = analysis([country("FR", [], mock)], [snapshot("google-autocomplete", "mock")], { dataMode: "mock" });

    expect(sourceJournal(result)).toEqual([]);
  });

  it("counts the analysis-level customs code as used for every analysed country", () => {
    const tariff = { ...testSource("uk-trade-tariff"), collectedAt: "2026-10-12T09:30:00.000Z" };
    const classification = observed({ code: "6115950000", hs6: "611595", description: "Chaussettes", method: "search" as const }, "none", [tariff]);
    const result = analysis([country("FR", [], null), country("DE", [], null)], [], { classification });

    expect(sourceJournal(result)).toEqual([
      { providerId: "uk-trade-tariff", name: "Tarif douanier (UK / UE)", countries: ["FR", "DE"], status: "used", collectedAt: "2026-10-12T09:30:00.000Z" },
    ]);
  });

  it("still builds for a pre-V1 analysis stored without the context column nor country signals", () => {
    // Read back from jsonb as stored before 2026-10-15: no `signals` key at all.
    const legacy = JSON.parse(JSON.stringify({ ...country("FR", [issue("meta-ad-library", "unauthorized")], null), signals: undefined })) as CountryAnalysis;
    const result = analysis([legacy], [snapshot("meta-ad-library", "ready"), snapshot("google-trends", "not_configured")]);

    expect(sourceJournal(result)).toEqual([
      { providerId: "google-trends", name: "Google Trends", countries: ["FR"], status: "not_configured" },
      { providerId: "meta-ad-library", name: "Meta Ad Library", countries: ["FR"], status: "failed", errorCode: "unauthorized" },
    ]);
  });
});
