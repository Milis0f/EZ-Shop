CREATE TABLE "competitor_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"product_count" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "competitor_readings_domain_idx" ON "competitor_readings" USING btree ("domain","observed_at" DESC NULLS LAST);