CREATE TYPE "public"."approval_status" AS ENUM('draft', 'approved', 'rejected', 'posted');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."time_tracking_kind" AS ENUM('baseline', 'pilot');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"industry" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT '' NOT NULL,
	"timezone" text DEFAULT 'Asia/Jerusalem' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"tone" text DEFAULT '' NOT NULL,
	"writing_style" text DEFAULT '' NOT NULL,
	"preferred_terms" text DEFAULT '' NOT NULL,
	"prohibited_terms" text DEFAULT '' NOT NULL,
	"content_restrictions" text DEFAULT '' NOT NULL,
	"cta_guidelines" text DEFAULT '' NOT NULL,
	"products_services" text DEFAULT '' NOT NULL,
	"additional_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"brief_id" uuid NOT NULL,
	"platform" varchar(32) DEFAULT 'instagram' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"content_concept" text NOT NULL,
	"draft_caption" text NOT NULL,
	"current_caption" text NOT NULL,
	"cta" text DEFAULT '' NOT NULL,
	"source_reference" text DEFAULT '' NOT NULL,
	"needs_clarification" boolean DEFAULT false NOT NULL,
	"clarification_note" text DEFAULT '' NOT NULL,
	"approval_status" "approval_status" DEFAULT 'draft' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_version" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_historical_replay" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historical_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"platform" varchar(32) DEFAULT 'instagram' NOT NULL,
	"caption" text NOT NULL,
	"published_at" date,
	"category" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posting_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"platform" varchar(32) DEFAULT 'instagram' NOT NULL,
	"weekday" integer NOT NULL,
	"posting_time" time NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" uuid NOT NULL,
	"approved_version" integer NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"provider" varchar(32) NOT NULL,
	"delivery_status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"delivered_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_tracking_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"kind" time_tracking_kind NOT NULL,
	"planning_minutes" integer DEFAULT 0 NOT NULL,
	"writing_minutes" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"raw_ideas" text DEFAULT '' NOT NULL,
	"promotions" text DEFAULT '' NOT NULL,
	"events" text DEFAULT '' NOT NULL,
	"additional_instructions" text DEFAULT '' NOT NULL,
	"is_historical_replay" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_brief_id_weekly_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."weekly_briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_posts" ADD CONSTRAINT "historical_posts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posting_schedules" ADD CONSTRAINT "posting_schedules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_tracking_entries" ADD CONSTRAINT "time_tracking_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_briefs" ADD CONSTRAINT "weekly_briefs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_items_client_idx" ON "content_items" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "content_items_brief_idx" ON "content_items" USING btree ("brief_id");--> statement-breakpoint
CREATE INDEX "content_items_scheduled_idx" ON "content_items" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "content_items_status_idx" ON "content_items" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX "historical_posts_client_idx" ON "historical_posts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "posting_schedules_client_idx" ON "posting_schedules" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_deliveries_item_version_unique" ON "reminder_deliveries" USING btree ("content_item_id","approved_version");--> statement-breakpoint
CREATE INDEX "reminder_deliveries_status_idx" ON "reminder_deliveries" USING btree ("delivery_status");--> statement-breakpoint
CREATE INDEX "time_tracking_client_idx" ON "time_tracking_entries" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_briefs_client_week_unique" ON "weekly_briefs" USING btree ("client_id","week_start");--> statement-breakpoint
CREATE INDEX "weekly_briefs_client_idx" ON "weekly_briefs" USING btree ("client_id");