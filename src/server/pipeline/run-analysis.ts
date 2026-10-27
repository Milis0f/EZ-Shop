import { buildAssumptions } from "@/config/assumptions";
import type { ServerEnv } from "@/config/env";
import { SCORING_MODEL_VERSION } from "@/config/scoring";
import { ANALYSIS_SCHEMA_VERSION, type AnalysisResult, type UnitEconomics } from "@/domain/analysis";
import { analysisInputSchema, type AnalysisInput } from "@/domain/schemas";
import { analyzeCountry } from "@/engine/analyze-country";
import { readSourcing } from "@/engine/economics/market-margin";
import { expandProduct } from "@/engine/terms/expand";
import { describeStorageError } from "@/lib/storage-safe";
import {
  createProviderSet,
  listProviders,
  REAL_PROVIDER_METAS,
  snapshotStatuses,
  type ProviderSet,
} from "@/providers/registry";
import type { AnalysisRepository, Repositories } from "../repositories/types";
import { COLLECTION, collectCountry, collectMacro, mapWithConcurrency, type TopicMemo } from "./collect";
import { collectGlobal } from "./collect-global";
import { addMachineTranslations } from "./translate";
import { observationsFor, snapshotsFor } from "./observations";

export class AnalysisValidationError extends Error {
  constructor(readonly issues: ReadonlyArray<{ path: string; message: string }>) {
    super("Invalid analysis input");
    this.name = "AnalysisValidationError";
  }
}

export interface PipelineDeps {
  readonly repositories: Repositories;
  readonly env: ServerEnv;
  readonly now?: () => Date;
  /** Test seam: inject a provider set instead of building one from env. */
  readonly providers?: ProviderSet;
}

export function parseAnalysisInput(raw: unknown): AnalysisInput {
  const parsed = analysisInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AnalysisValidationError(parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return parsed.data;
}

/**
 * Runs a full analysis synchronously and persists it.
 * TODO(jobs): move to a background job runner (Inngest / Trigger.dev) once live connectors
 * make collection slow; the repository already supports the running → completed lifecycle.
 */
export async function runAnalysis(raw: unknown, deps: PipelineDeps): Promise<AnalysisResult> {
  const input = parseAnalysisInput(raw);
  const now = deps.now?.() ?? new Date();
  const providers = deps.providers ?? createProviderSet({ env: deps.env, cache: deps.repositories.cache });
  // Machine translations first: the stored product must list every term actually queried.
  const translated = await addMachineTranslations(expandProduct(input), input.countries, providers.translator);
  const product = translated.product;
  const assumptions = buildAssumptions(input.assumptionOverrides);
  const economics: UnitEconomics = { ...input.economics };
  const metas = listProviders(providers).map((p) => p.meta);
  const quality = new Map<string, number>(metas.map((m) => [m.id, m.qualityTier]));

  const created = await deps.repositories.analyses.create({
    product,
    input,
    economics,
    dataMode: input.dataMode,
    modelVersion: SCORING_MODEL_VERSION,
    providers: snapshotStatuses(providers),
    providerMetas: REAL_PROVIDER_METAS,
  });

  try {
    const [macro, global] = await Promise.all([
      collectMacro(providers, input.countries),
      collectGlobal(providers, product, {
        countries: input.countries,
        originCountry: input.originCountry,
        hsCode: input.hsCode,
        issues: translated.issues,
      }),
    ]);
    const topicMemo: TopicMemo = new Map();
    const signals = await mapWithConcurrency(input.countries, COLLECTION.countryConcurrency, (country) =>
      collectCountry(providers, product, country, macro, global, topicMemo, now),
    );
    const sourcing = readSourcing(global.sourcing, global.fx);
    const countries = signals.map((s) =>
      analyzeCountry(s, {
        assumptions,
        economics,
        now,
        seed: created.id,
        qualityOf: (id) => quality.get(id),
        global: { fx: global.fx, sourcing, origin: input.originCountry },
      }),
    );

    const result: AnalysisResult = {
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      id: created.id,
      status: "completed",
      createdAt: created.createdAt,
      completedAt: new Date().toISOString(),
      dataMode: input.dataMode,
      input,
      product,
      economics,
      assumptions: Object.values(assumptions),
      providers: snapshotStatuses(providers),
      countries,
      modelVersion: SCORING_MODEL_VERSION,
      sourcing,
      classification: global.classification,
    };

    await deps.repositories.analyses.complete({
      result,
      productId: created.productId,
      observations: signals.flatMap((s) => observationsFor(s, macro.observations)),
      snapshots: signals.flatMap(snapshotsFor),
    });
    return result;
  } catch (error: unknown) {
    await recordFailure(deps.repositories.analyses, created.id, error);
    throw error;
  }
}

/**
 * Marks the analysis as failed. If that write fails too, the caller must still see the pipeline
 * error, so the recording error is logged (name and SQLSTATE only) and swallowed.
 */
async function recordFailure(repo: AnalysisRepository, id: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Unknown pipeline error";
  try {
    await repo.fail(id, message);
  } catch (recordingError: unknown) {
    // Never the raw message: a database error can embed the SQL and its parameters.
    console.error(`[runAnalysis] could not record the failure of analysis ${id}: ${describeStorageError(recordingError)}`);
  }
}
