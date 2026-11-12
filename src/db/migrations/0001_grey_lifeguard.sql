CREATE TYPE "public"."reel_status" AS ENUM('uploaded', 'processing', 'ready_for_review', 'approved', 'rejected', 'failed');--> statement-breakpoint
CREATE TABLE "reel_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"raw_footage_url" text NOT NULL,
	"status" "reel_status" DEFAULT 'uploaded' NOT NULL,
	"error_message" text DEFAULT '' NOT NULL,
	"keep_segments" jsonb,
	"captions" jsonb,
	"rendered_video_url" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reel_items" ADD CONSTRAINT "reel_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reel_items_client_idx" ON "reel_items" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "reel_items_status_idx" ON "reel_items" USING btree ("status");