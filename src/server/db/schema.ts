import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AssumptionKey, Distribution } from "@/domain/assumption";
import type { AnalysisContext, CountryAnalysis, ProviderStatusSnapshot, UnitEconomics } from "@/domain/analysis";
import type { ProductQuery } from "@/domain/product";
import type { AnalysisInput } from "@/domain/schemas";

/**
 * Country-level only: every geographic column is an ISO 3166-1 alpha-2 country code.
 * There is intentionally no region / city / postal-code column anywhere.
 */

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const countryCode = (name = "country_code") => text(name).notNull();
const countryCheck = (table: string, column = "country_code") =>
  check(`${table}_${column}_iso2`, sql.raw(`${column} ~ '^[A-Z]{2}$'`));

export const dataModeEnum = pgEnum("data_mode", ["live", "mock"]);
export const analysisStatusEnum = pgEnum("analysis_status", ["running", "completed", "failed"]);
export const dataOriginEnum = pgEnum("data_origin", ["live", "mock", "user", "config"]);

// ---------- Products ----------

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalKey: text("canonical_key").notNull().unique(),
  displayName: text("display_name").notNull(),
  inputLanguage: text("input_language").notNull(),
  createdAt: createdAt(),
});

export const productTerms = pgTable(
  "product_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    language: text("language").notNull(),
    kind: text("kind").notNull(),
    source: text("source").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("product_terms_unique").on(t.productId, t.term, t.language)],
);

// ---------- Provider registry ----------

export const dataProviders = pgTable("data_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  authMode: text("auth_mode").notNull(),
  docsUrl: text("docs_url").notNull(),
  qualityTier: doublePrecision("quality_tier").notNull(),
  connectorVersion: text("connector_version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Analyses ----------

export const analyses = pgTable(
  "analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    status: analysisStatusEnum("status").notNull().default("running"),
    dataMode: dataModeEnum("data_mode").notNull(),
    input: jsonb("input").$type<AnalysisInput>().notNull(),
    /** Terms actually used for this run (frozen: product_terms accumulates across runs). */
    product: jsonb("product").$type<ProductQuery>().notNull(),
    economics: jsonb("economics").$type<UnitEconomics>().notNull(),
    providers: jsonb("providers").$type<ProviderStatusSnapshot[]>().notNull().default([]),
    /** Analysis-level data of sources v2 (sourcing offer, customs classification). Null before 2026-10-15. */
    context: jsonb("context").$type<AnalysisContext>(),
    modelVersion: text("model_version").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    error: text("error"),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("analyses_created_at_idx").on(t.createdAt.desc()), index("analyses_product_idx").on(t.productId)],
);

/** One row per analysed country. `result` holds the full typed CountryAnalysis. */
export const countryResults = pgTable(
  "country_results",
  {
    analysisId: uuid("analysis_id").notNull().references(() => analyses.id, { onDelete: "cascade" }),
    countryCode: countryCode(),
    opportunityScore: doublePrecision("opportunity_score"),
    confidenceScore: doublePrecision("confidence_score").notNull(),
    coverage: doublePrecision("coverage").notNull(),
    decision: text("decision").notNull(),
    mockTainted: boolean("mock_tainted").notNull(),
    result: jsonb("result").$type<CountryAnalysis>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.analysisId, t.countryCode] }), countryCheck("country_results")],
);

// ---------- Traceability ----------

/** Every raw value collected from a source, including time-series points. */
export const observations = pgTable(
  "observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id").notNull().references(() => analyses.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull().references(() => dataProviders.id),
    countryCode: countryCode(),
    metric: text("metric").notNull(),
    term: text("term"),
    periodStart: text("period_start"),
    periodEnd: text("period_end"),
    value: doublePrecision("value").notNull(),
    unit: text("unit").notNull(),
    origin: dataOriginEnum("origin").notNull(),
    queryRef: text("query_ref"),
    sourceUrl: text("source_url"),
    connectorVersion: text("connector_version").notNull(),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("observations_lookup_idx").on(t.productId, t.countryCode, t.metric),
    index("observations_analysis_idx").on(t.analysisId),
    countryCheck("observations"),
  ],
);

export const assumptions = pgTable(
  "assumptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id").notNull().references(() => analyses.id, { onDelete: "cascade" }),
    key: text("key").$type<AssumptionKey>().notNull(),
    label: text("label").notNull(),
    description: text("description").notNull(),
    unit: text("unit").notNull(),
    distribution: jsonb("distribution").$type<Distribution>().notNull(),
    origin: text("origin").notNull(),
    rationale: text("rationale").notNull(),
  },
  (t) => [uniqueIndex("assumptions_unique").on(t.analysisId, t.key)],
);

export const forecasts = pgTable(
  "forecasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id").notNull().references(() => analyses.id, { onDelete: "cascade" }),
    countryCode: countryCode(),
    metric: text("metric").notNull(),
    month: text("month").notNull(),
    p10: doublePrecision("p10").notNull(),
    p50: doublePrecision("p50").notNull(),
    p90: doublePrecision("p90").notNull(),
    basis: text("basis").notNull(),
    method: text("method").notNull(),
    modelVersion: text("model_version").notNull(),
  },
  (t) => [index("forecasts_analysis_idx").on(t.analysisId, t.countryCode), countryCheck("forecasts")],
);

export const scoreComponents = pgTable(
  "score_components",
  {
    analysisId: uuid("analysis_id").notNull().references(() => analyses.id, { onDelete: "cascade" }),
    countryCode: countryCode(),
    criterionId: text("criterion_id").notNull(),
    weight: doublePrecision("weight").notNull(),
    status: text("status").notNull(),
    normalized: doublePrecision("normalized"),
    points: doublePrecision("points"),
    rawValue: doublePrecision("raw_value"),
    explanation: text("explanation").notNull(),
    modelVersion: text("model_version").notNull(),
  },
  (t) => [primaryKey({ columns: [t.analysisId, t.countryCode, t.criterionId] }), countryCheck("score_components")],
);

/** Competition history across analyses of the same product — feeds future-competition estimates. */
export const competitionSnapshots = pgTable(
  "competition_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    analysisId: uuid("analysis_id").references(() => analyses.id, { onDelete: "set null" }),
    countryCode: countryCode(),
    providerId: text("provider_id").notNull().references(() => dataProviders.id),
    activeAds: integer("active_ads").notNull(),
    uniqueAdvertisers: integer("unique_advertisers").notNull(),
    origin: dataOriginEnum("origin").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("competition_snapshots_lookup_idx").on(t.productId, t.countryCode, t.providerId, t.capturedAt),
    countryCheck("competition_snapshots"),
  ],
);

/** Raw provider responses, to avoid re-calling slow-moving public APIs. */
export const providerCache = pgTable(
  "provider_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    providerId: text("provider_id").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("provider_cache_expires_idx").on(t.expiresAt)],
);
