import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/config/env";
import { DATA_INSUFFICIENT, isKnown } from "@/domain/datum";
import { aliexpressMeta } from "@/providers/aliexpress/adapter";
import { ukTradeTariffMeta } from "@/providers/customs/uk-trade-tariff";
import { usitcMeta } from "@/providers/customs/usitc";
import { ebayMeta } from "@/providers/ebay/adapter";
import { googleAutocompleteMeta } from "@/providers/google-autocomplete/adapter";
import { ecbFxMeta } from "@/providers/reference/ecb-fx";
import { vatRatesMeta } from "@/providers/reference/vat-rates";
import { createProviderSet, MockDataNotAllowedError, type ProviderSet } from "@/providers/registry";
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
import { worldBankMeta } from "@/providers/world-bank/adapter";
import { youtubeMeta } from "@/providers/youtube/adapter";
import { createMemoryRepositories } from "../repositories/memory-repositories";
import type { Repositories } from "../repositories/types";
import { AnalysisValidationError, runAnalysis } from "./run-analysis";

const NOW = new Date("2026-10-14T12:00:00Z");
const devEnv = { NODE_ENV: "development", PGLITE_DATA_DIR: ".data/test", PROVIDER_HTTP_TIMEOUT_MS: 1000 } as ServerEnv;

const input = {
  productName: "Chaussettes chauffantes",
  countries: ["FR", "DE", "US"],
  extraTerms: [
    { language: "de", term: "beheizbare Socken" },
    { language: "en", term: "heated socks" },
  ],
  economics: { currency: "EUR", sellingPrice: 29, landedCost: 9 },
};

/** The input refuses mock data: tests inject the offline fixtures through the providers seam. */
const mockProviders = (repositories: Repositories): ProviderSet =>
  createProviderSet("mock", { env: devEnv, cache: repositories.cache, now: () => NOW });

describe("runAnalysis (mock providers, in-memory repositories)", () => {
  it("analyses every requested country and persists the audit trail", async () => {
    const repositories = createMemoryRepositories();
    const result = await runAnalysis(input, { repositories, env: devEnv, now: () => NOW, providers: mockProviders(repositories) });

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
    expect(summary).toMatchObject({ id: result.id, status: "completed", dataMode: "live", countryCount: 3 });
  });

  it("still runs a pre-V1 landed cost, read as the supplier price with no separate shipping", async () => {
    const repositories = createMemoryRepositories();
    const result = await runAnalysis(input, { repositories, env: devEnv, now: () => NOW, providers: mockProviders(repositories) });

    expect(result.economics).toEqual({ currency: "EUR", sellingPrice: 29, landedCost: 9, supplierPrice: 9, shippingCost: 0 });
  });

  it("refuses mock data before writing anything", async () => {
    const repositories = createMemoryRepositories();

    const promise = runAnalysis({ ...input, dataMode: "mock" }, { repositories, env: devEnv, now: () => NOW });

    await expect(promise).rejects.toBeInstanceOf(AnalysisValidationError);
    await expect(promise).rejects.toMatchObject({
      issues: [{ path: "dataMode", message: "Les données fictives ont été retirées de l'application." }],
    });
    expect(await repositories.analyses.listRecent(5)).toHaveLength(0);
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

  it("rejects forbidden characters before creating an analysis", async () => {
    const repositories = createMemoryRepositories();
    const create = vi.spyOn(repositories.analyses, "create");

    const promise = runAnalysis({ ...input, productName: "Lampe\u0000LED" }, { repositories, env: devEnv, now: () => NOW });

    await expect(promise).rejects.toBeInstanceOf(AnalysisValidationError);
    await expect(promise).rejects.toMatchObject({ issues: [expect.objectContaining({ path: "productName" })] });
    expect(create).not.toHaveBeenCalled();
    expect(await repositories.analyses.listRecent(5)).toHaveLength(0);
  });

  it("refuses mock data in production", () => {
    const prod = { ...devEnv, NODE_ENV: "production" } as ServerEnv;
    expect(() => createProviderSet("mock", { env: prod, cache: createMemoryRepositories().cache })).toThrow(MockDataNotAllowedError);
  });
});

describe("runAnalysis when the pipeline crashes after the analysis row exists", () => {
  const crash = new Error("collector crashed");

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Mock set whose only macro collector throws: the crash happens after `create`, inside the try block. */
  function crashingProviders(repositories: Repositories): ProviderSet {
    const base = mockProviders(repositories);
    return {
      ...base,
      macro: [
        {
          meta: worldBankMeta,
          indicators: [],
          status: () => ({ state: "ready", detail: "" }),
          getIndicators: async () => {
            throw crash;
          },
        },
      ],
    };
  }

  it("rethrows the pipeline error when recording the failure also fails", async () => {
    const repositories = createMemoryRepositories();
    const recording = vi.spyOn(repositories.analyses, "fail").mockImplementation(async () => {
      throw Object.assign(new Error("db down SECRET-TOKEN-123"), { code: "08006" });
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      runAnalysis(input, { repositories, env: devEnv, now: () => NOW, providers: crashingProviders(repositories) }),
    ).rejects.toBe(crash);

    expect(recording).toHaveBeenCalledOnce();
    const [id] = recording.mock.calls[0];
    // One string: the analysis id and the SQLSTATE, never the database's message.
    expect(logged.mock.calls).toEqual([
      [`[runAnalysis] could not record the failure of analysis ${id}: Error (code 08006)`],
    ]);
    const text = String(logged.mock.calls[0][0]);
    expect(text).not.toContain("db down");
    expect(text).not.toContain("SECRET-TOKEN-123");
  });

  it("still records the failure when it can", async () => {
    const repositories = createMemoryRepositories();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      runAnalysis(input, { repositories, env: devEnv, now: () => NOW, providers: crashingProviders(repositories) }),
    ).rejects.toBe(crash);

    // The memory repository keeps no result for a failed analysis, so its status shows in the summaries.
    expect(await repositories.analyses.listRecent(5)).toMatchObject([{ status: "failed" }]);
    expect(logged).not.toHaveBeenCalled();
  });
});
