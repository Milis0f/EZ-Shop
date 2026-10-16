CREATE TYPE "public"."analysis_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."data_mode" AS ENUM('live', 'mock');--> statement-breakpoint
CREATE TYPE "public"."data_origin" AS ENUM('live', 'mock', 'user', 'config');--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"status" "analysis_status" DEFAULT 'running' NOT NULL,
	"data_mode" "data_mode" NOT NULL,
	"input" jsonb NOT NULL,
	"product" jsonb NOT NULL,
	"economics" jsonb NOT NULL,
	"providers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_version" text NOT NULL,
	"schema_version" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "assumptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"unit" text NOT NULL,
	"distribution" jsonb NOT NULL,
	"origin" text NOT NULL,
	"rationale" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"analysis_id" uuid,
	"country_code" text NOT NULL,
	"provider_id" text NOT NULL,
	"active_ads" integer NOT NULL,
	"unique_advertisers" integer NOT NULL,
	"origin" "data_origin" NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_snapshots_country_code_iso2" CHECK (country_code ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "country_results" (
	"analysis_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"opportunity_score" double precision,
	"confidence_score" double precision NOT NULL,
	"coverage" double precision NOT NULL,
	"decision" text NOT NULL,
	"mock_tainted" boolean NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_results_analysis_id_country_code_pk" PRIMARY KEY("analysis_id","country_code"),
	CONSTRAINT "country_results_country_code_iso2" CHECK (country_code ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "data_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"auth_mode" text NOT NULL,
	"docs_url" text NOT NULL,
	"quality_tier" double precision NOT NULL,
	"connector_version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"metric" text NOT NULL,
	"month" text NOT NULL,
	"p10" double precision NOT NULL,
	"p50" double precision NOT NULL,
	"p90" double precision NOT NULL,
	"basis" text NOT NULL,
	"method" text NOT NULL,
	"model_version" text NOT NULL,
	CONSTRAINT "forecasts_country_code_iso2" CHECK (country_code ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"product_id" uuid,
	"provider_id" text NOT NULL,
	"country_code" text NOT NULL,
	"metric" text NOT NULL,
	"term" text,
	"period_start" text,
	"period_end" text,
	"value" double precision NOT NULL,
	"unit" text NOT NULL,
	"origin" "data_origin" NOT NULL,
	"query_ref" text,
	"source_url" text,
	"connector_version" text NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	CONSTRAINT "observations_country_code_iso2" CHECK (country_code ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "product_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"term" text NOT NULL,
	"language" text NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_key" text NOT NULL,
	"display_name" text NOT NULL,
	"input_language" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_canonical_key_unique" UNIQUE("canonical_key")
);
--> statement-breakpoint
CREATE TABLE "provider_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_components" (
	"analysis_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"criterion_id" text NOT NULL,
	"weight" double precision NOT NULL,
	"status" text NOT NULL,
	"normalized" double precision,
	"points" double precision,
	"raw_value" double precision,
	"explanation" text NOT NULL,
	"model_version" text NOT NULL,
	CONSTRAINT "score_components_analysis_id_country_code_criterion_id_pk" PRIMARY KEY("analysis_id","country_code","criterion_id"),
	CONSTRAINT "score_components_country_code_iso2" CHECK (country_code ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assumptions" ADD CONSTRAINT "assumptions_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_snapshots" ADD CONSTRAINT "competition_snapshots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_snapshots" ADD CONSTRAINT "competition_snapshots_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_snapshots" ADD CONSTRAINT "competition_snapshots_provider_id_data_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."data_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_results" ADD CONSTRAINT "country_results_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_provider_id_data_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."data_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_terms" ADD CONSTRAINT "product_terms_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_components" ADD CONSTRAINT "score_components_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyses_created_at_idx" ON "analyses" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "analyses_product_idx" ON "analyses" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assumptions_unique" ON "assumptions" USING btree ("analysis_id","key");--> statement-breakpoint
CREATE INDEX "competition_snapshots_lookup_idx" ON "competition_snapshots" USING btree ("product_id","country_code","provider_id","captured_at");--> statement-breakpoint
CREATE INDEX "forecasts_analysis_idx" ON "forecasts" USING btree ("analysis_id","country_code");--> statement-breakpoint
CREATE INDEX "observations_lookup_idx" ON "observations" USING btree ("product_id","country_code","metric");--> statement-breakpoint
CREATE INDEX "observations_analysis_idx" ON "observations" USING btree ("analysis_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_terms_unique" ON "product_terms" USING btree ("product_id","term","language");--> statement-breakpoint
CREATE INDEX "provider_cache_expires_idx" ON "provider_cache" USING btree ("expires_at");