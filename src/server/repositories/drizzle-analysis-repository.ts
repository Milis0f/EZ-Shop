import { desc, eq, inArray } from "drizzle-orm";
import { ANALYSIS_SCHEMA_VERSION, type AnalysisResult, type AnalysisSummary } from "@/domain/analysis";
import { ASSUMPTION_KEYS } from "@/domain/assumption";
import type { CountryCode } from "@/domain/country";
import { isKnown } from "@/domain/datum";
import type { Database } from "../db/client";
import * as t from "../db/schema";
import { toSummary } from "./summary";
import type { AnalysisRepository, CompletedAnalysis, CreatedAnalysis, NewAnalysis } from "./types";

const INSERT_CHUNK = 500;

function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

export class DrizzleAnalysisRepository implements AnalysisRepository {
  constructor(private readonly db: Database) {}

  async create(analysis: NewAnalysis): Promise<CreatedAnalysis> {
    const { product } = analysis;
    return this.db.transaction(async (tx) => {
      const [productRow] = await tx
        .insert(t.products)
        .values({ canonicalKey: product.canonicalKey, displayName: product.displayName, inputLanguage: product.inputLanguage })
        .onConflictDoUpdate({ target: t.products.canonicalKey, set: { displayName: product.displayName } })
        .returning({ id: t.products.id });

      if (product.terms.length > 0) {
        await tx
          .insert(t.productTerms)
          .values(product.terms.map((term) => ({ productId: productRow.id, ...term })))
          .onConflictDoNothing();
      }

      for (const meta of analysis.providerMetas) {
        const values = {
          id: meta.id,
          name: meta.name,
          category: meta.category,
          authMode: meta.authMode,
          docsUrl: meta.docsUrl,
          qualityTier: meta.qualityTier,
          connectorVersion: meta.connectorVersion,
        };
        await tx
          .insert(t.dataProviders)
          .values(values)
          .onConflictDoUpdate({ target: t.dataProviders.id, set: { ...values, updatedAt: new Date() } });
      }

      const [row] = await tx
        .insert(t.analyses)
        .values({
          productId: productRow.id,
          dataMode: analysis.dataMode,
          input: analysis.input,
          product,
          economics: analysis.economics,
          providers: [...analysis.providers],
          modelVersion: analysis.modelVersion,
          schemaVersion: ANALYSIS_SCHEMA_VERSION,
        })
        .returning({ id: t.analyses.id, createdAt: t.analyses.createdAt });

      return { id: row.id, productId: productRow.id, createdAt: row.createdAt.toISOString() };
    });
  }

  async complete({ result, productId, observations, snapshots }: CompletedAnalysis): Promise<void> {
    const analysisId = result.id;
    await this.db.transaction(async (tx) => {
      for (const country of result.countries) {
        const { scoring } = country;
        await tx.insert(t.countryResults).values({
          analysisId,
          countryCode: country.country,
          opportunityScore: isKnown(scoring.score) ? scoring.score.value.total : null,
          confidenceScore: scoring.confidence.score,
          coverage: isKnown(scoring.score) ? scoring.score.value.coverage : 0,
          decision: scoring.decision,
          mockTainted: scoring.confidence.mockTainted,
          result: country,
        });

        if (scoring.criteria.length > 0) {
          await tx.insert(t.scoreComponents).values(
            scoring.criteria.map((c) => ({
              analysisId,
              countryCode: country.country,
              criterionId: c.id,
              weight: c.weight,
              status: c.status,
              normalized: c.normalized ?? null,
              points: c.points ?? null,
              rawValue: c.rawValue ?? null,
              explanation: c.explanation,
              modelVersion: result.modelVersion,
            })),
          );
        }

        const forecast = country.demand.forecast;
        if (isKnown(forecast) && forecast.value.points.length > 0) {
          await tx.insert(t.forecasts).values(
            forecast.value.points.map((p) => ({
              analysisId,
              countryCode: country.country,
              metric: "search_demand",
              month: p.month,
              p10: p.p10,
              p50: p.p50,
              p90: p.p90,
              basis: forecast.value.basis,
              method: forecast.value.method,
              modelVersion: result.modelVersion,
            })),
          );
        }
      }

      if (result.assumptions.length > 0) {
        await tx.insert(t.assumptions).values(
          result.assumptions.map((a) => ({
            analysisId,
            key: a.key,
            label: a.label,
            description: a.description,
            unit: a.unit,
            distribution: a.distribution,
            origin: a.origin,
            rationale: a.rationale,
          })),
        );
      }

      for (const batch of chunk(observations, INSERT_CHUNK)) {
        await tx.insert(t.observations).values(
          batch.map((o) => ({
            analysisId,
            productId,
            providerId: o.providerId,
            countryCode: o.country,
            metric: o.metric,
            term: o.term ?? null,
            periodStart: o.periodStart ?? null,
            periodEnd: o.periodEnd ?? null,
            value: o.value,
            unit: o.unit,
            origin: o.origin,
            queryRef: o.queryRef ?? null,
            sourceUrl: o.sourceUrl ?? null,
            connectorVersion: o.connectorVersion,
            collectedAt: new Date(o.collectedAt),
          })),
        );
      }

      if (snapshots.length > 0) {
        await tx.insert(t.competitionSnapshots).values(
          snapshots.map((s) => ({ productId, analysisId, countryCode: s.country, ...pickSnapshot(s) })),
        );
      }

      await tx
        .update(t.analyses)
        .set({
          status: "completed",
          completedAt: new Date(result.completedAt ?? Date.now()),
          providers: [...result.providers],
          context: { sourcing: result.sourcing, classification: result.classification },
        })
        .where(eq(t.analyses.id, analysisId));
    });
  }

  async fail(id: string, error: string): Promise<void> {
    await this.db
      .update(t.analyses)
      .set({ status: "failed", error: error.slice(0, 2_000), completedAt: new Date() })
      .where(eq(t.analyses.id, id));
  }

  async findById(id: string): Promise<AnalysisResult | null> {
    const [row] = await this.db.select().from(t.analyses).where(eq(t.analyses.id, id)).limit(1);
    if (!row) return null;

    const [countryRows, assumptionRows] = await Promise.all([
      this.db.select({ result: t.countryResults.result }).from(t.countryResults).where(eq(t.countryResults.analysisId, id)),
      this.db.select().from(t.assumptions).where(eq(t.assumptions.analysisId, id)),
    ]);

    const order = new Map(row.input.countries.map((code, index) => [code, index]));
    const countries = countryRows
      .map((r) => r.result)
      .toSorted((a, b) => (order.get(a.country) ?? 0) - (order.get(b.country) ?? 0));

    return {
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      id: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString(),
      error: row.error ?? undefined,
      dataMode: row.dataMode,
      input: row.input,
      product: row.product,
      economics: row.economics,
      providers: row.providers,
      modelVersion: row.modelVersion,
      countries,
      ...(row.context?.sourcing ? { sourcing: row.context.sourcing } : {}),
      ...(row.context?.classification ? { classification: row.context.classification } : {}),
      assumptions: assumptionRows
        .toSorted((a, b) => ASSUMPTION_KEYS.indexOf(a.key) - ASSUMPTION_KEYS.indexOf(b.key))
        .map((a) => ({
        key: a.key,
        label: a.label,
        description: a.description,
        unit: a.unit as AnalysisResult["assumptions"][number]["unit"],
        distribution: a.distribution,
        origin: a.origin === "user" ? "user" : "default",
        rationale: a.rationale,
      })),
    };
  }

  async listRecent(limit: number): Promise<AnalysisSummary[]> {
    const rows = await this.db
      .select({
        id: t.analyses.id,
        status: t.analyses.status,
        dataMode: t.analyses.dataMode,
        input: t.analyses.input,
        createdAt: t.analyses.createdAt,
        productName: t.products.displayName,
      })
      .from(t.analyses)
      .innerJoin(t.products, eq(t.products.id, t.analyses.productId))
      .orderBy(desc(t.analyses.createdAt))
      .limit(limit);
    if (rows.length === 0) return [];

    const scores = await this.db
      .select({
        analysisId: t.countryResults.analysisId,
        countryCode: t.countryResults.countryCode,
        opportunityScore: t.countryResults.opportunityScore,
        confidenceScore: t.countryResults.confidenceScore,
      })
      .from(t.countryResults)
      .where(inArray(t.countryResults.analysisId, rows.map((r) => r.id)));

    return rows.map((r) =>
      toSummary({
        id: r.id,
        productName: r.productName,
        status: r.status,
        dataMode: r.dataMode,
        countryCount: r.input.countries.length,
        createdAt: r.createdAt.toISOString(),
        scores: scores
          .filter((s) => s.analysisId === r.id)
          .map((s) => ({ ...s, countryCode: s.countryCode as CountryCode })),
      }),
    );
  }
}

function pickSnapshot(s: CompletedAnalysis["snapshots"][number]) {
  return { providerId: s.providerId, activeAds: s.activeAds, uniqueAdvertisers: s.uniqueAdvertisers, origin: s.origin };
}
