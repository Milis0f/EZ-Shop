import { describe, expect, it } from "vitest";
import type { ServerEnv } from "@/config/env";
import { DATA_INSUFFICIENT, isKnown } from "@/domain/datum";
import { aliexpressMeta } from "@/providers/aliexpress/adapter";
import { ukTradeTariffMeta } from "@/providers/customs/uk-trade-tariff";
import { usitcMeta } from "@/providers/customs/usitc";
import { ebayMeta } from "@/providers/ebay/adapter";
import { googleAutocompleteMeta } from "@/providers/google-autocomplete/adapter";
import { ecbFxMeta } from "@/providers/reference/ecb-fx";
import { vatRatesMeta } from "@/providers/reference/vat-rates";
import { createProviderSet, MockDataNotAllowedError } from "@/providers/registry";
import {
  unavailableContent,
  unavailableFx,
  unavailableMarketplace,
  unavailableSourcing,
  unavailableSuggest,
  unavailableTariff,
  unavailableTopic,
  unavailableTranslator,
  unavailableVat,
} from "@/providers/unavailable";
import { myMemoryMeta } from "@/providers/translation/mymemory";
import { wikimediaMeta } from "@/providers/wikimedia/adapter";
import { youtubeMeta } from "@/providers/youtube/adapter";
import { createMemoryRepositories } from "../repositories/memory-repositories";
import { AnalysisValidationError, runAnalysis } from "./run-analysis";

const NOW = new Date("2026-10-14T12:00:00Z");
const devEnv = { NODE_ENV: "development", PGLITE_DATA_DIR: ".data/test", PROVIDER_HTTP_TIMEOUT_MS: 1000 } as ServerEnv;

const input = {
  productName: "Chaussettes chauffantes",
  countries: ["FR", "DE", "US"],
  dataMode: "mock",
  extraTerms: [
    { language: "de", term: "beheizbare Socken" },
    { language: "en", term: "heated socks" },
  ],
  economics: { currency: "EUR", sellingPrice: 29, landedCost: 9 },
};

describe("runAnalysis (mock providers, in-memory repositories)", () => {
  it("analyses every requested country and persists the audit trail", async () => {
    const repositories = createMemoryRepositories();
    const result = await runAnalysis(input, { repositories, env: devEnv, now: () => NOW });

    expect(result.status).toBe("completed");
    expect(result.countries.map((c) => c.country)).toEqual(["FR", "DE", "US"]);
    expect(result.assumptions.length).toBeGreaterThan(0);
    for (const country of result.countries) {
      expect(country.scoring.confidence.mockTainted).toBe(true);
      expect(isKnown(country.demand.history)).toBe(true);
    }

    // Meta / TikTok ad libraries cover the EU only — the US must stay DATA_INSUFFICIENT.
    const us = result.countries.find((c) => c.country === "US")!;
    expect(us.competition.meta.status).toBe(DATA_INSUFFICIENT);
    expect(us.issues.some((i) => i.code === "unsupported_country")).toBe(true);

    const persisted = repositories.analyses.persisted(result.id)!;
    expect(persisted.observations.length).toBeGreaterThan(100);
    expect(persisted.observations.every((o) => o.origin === "mock")).toBe(true);
    expect(persisted.snapshots.every((s) => s.country !== "US")).toBe(true);

    const [summary] = await repositories.analyses.listRecent(5);
    expect(summary).toMatchObject({ id: result.id, status: "completed", dataMode: "mock", countryCount: 3 });
  });

  it("returns DATA_INSUFFICIENT everywhere a live connector is not configured", async () => {
    const repositories = createMemoryRepositories();
    // Live set without network: open sources would hit the internet, so keep only unconfigured ones.
    const live = createProviderSet("live", { env: devEnv, cache: repositories.cache });
    const offline = {
      ...live,
      macro: [],
      suggest: unavailableSuggest(googleAutocompleteMeta),
      topicInterest: unavailableTopic(wikimediaMeta),
      content: unavailableContent(youtubeMeta),
      marketplace: unavailableMarketplace(ebayMeta),
      sourcing: unavailableSourcing(aliexpressMeta),
      tariffs: [unavailableTariff(ukTradeTariffMeta, ["gb", "eu"]), unavailableTariff(usitcMeta, ["us"])],
      vat: unavailableVat(vatRatesMeta),
      fx: unavailableFx(ecbFxMeta),
      translator: unavailableTranslator(myMemoryMeta),
    };
    const result = await runAnalysis({ ...input, dataMode: "live" }, { repositories, env: devEnv, now: () => NOW, providers: offline });

    for (const country of result.countries) {
      expect(country.demand.history.status).toBe(DATA_INSUFFICIENT);
      expect(country.sales.annualOrders.status).toBe(DATA_INSUFFICIENT);
      expect(country.scoring.score.status).toBe(DATA_INSUFFICIENT);
      expect(country.scoring.decision).toBe("insufficient_data");
      expect(country.issues.some((i) => i.providerId === "google-ads-keyword-planner" && i.code === "not_configured")).toBe(true);
    }
  });

  it("rejects invalid input before touching providers", async () => {
    const repositories = createMemoryRepositories();
    await expect(runAnalysis({ productName: "x", countries: [] }, { repositories, env: devEnv })).rejects.toBeInstanceOf(
      AnalysisValidationError,
    );
    expect(await repositories.analyses.listRecent(5)).toHaveLength(0);
  });

  it("refuses mock data in production", () => {
    const prod = { ...devEnv, NODE_ENV: "production" } as ServerEnv;
    expect(() => createProviderSet("mock", { env: prod, cache: createMemoryRepositories().cache })).toThrow(MockDataNotAllowedError);
  });
});
