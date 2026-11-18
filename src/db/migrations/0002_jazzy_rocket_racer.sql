ALTER TYPE "public"."reel_status" ADD VALUE 'downloading' BEFORE 'ready_for_review';--> statement-breakpoint
ALTER TYPE "public"."reel_status" ADD VALUE 'transcribing' BEFORE 'ready_for_review';--> statement-breakpoint
ALTER TYPE "public"."reel_status" ADD VALUE 'editing' BEFORE 'ready_for_review';--> statement-breakpoint
ALTER TYPE "public"."reel_status" ADD VALUE 'rendering' BEFORE 'ready_for_review';--> statement-breakpoint
ALTER TYPE "public"."reel_status" ADD VALUE 'uploading' BEFORE 'ready_for_review';--> statement-breakpoint
ALTER TABLE "reel_items" ALTER COLUMN "raw_footage_url" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "reel_items" ADD COLUMN "raw_footage_storage_key" text;--> statement-breakpoint
ALTER TABLE "reel_items" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reel_items" ADD COLUMN "claimed_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "reel_items" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reel_items" ADD COLUMN "progress_stage" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "reel_items" ADD COLUMN "output_storage_key" text;