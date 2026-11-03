CREATE TABLE "research_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"locale" text NOT NULL,
	"countries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"params" jsonb NOT NULL,
	"result" jsonb,
	"source_count" integer,
	"model" text,
	"error" text,
	"progress" double precision,
	"step" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "research_runs_created_at_idx" ON "research_runs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "research_runs_kind_idx" ON "research_runs" USING btree ("kind","created_at" DESC NULLS LAST);