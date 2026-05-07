-- Migration: replace document_export_counts with document_export_events
--
-- Metric 1 (replaced): document_export_counts was a daily aggregate, never read
-- by the application — purely a write target. The event log below supersedes it.
--
-- Metric 2 (new): append-only export event log, one row per export.
-- documentId is nullable so deleting a document doesn't erase history.

-- Step 1: create the event log table
CREATE TABLE IF NOT EXISTS "document_export_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_export_events" ADD CONSTRAINT "document_export_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_export_events" ADD CONSTRAINT "document_export_events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_export_events_user_id_idx" ON "document_export_events" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_export_events_document_id_idx" ON "document_export_events" USING btree ("document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_export_events_created_at_idx" ON "document_export_events" USING btree ("created_at");
--> statement-breakpoint

-- Step 2: add missing index on template_import_events.document_id
CREATE INDEX IF NOT EXISTS "template_import_events_document_id_idx" ON "template_import_events" USING btree ("document_id");
--> statement-breakpoint

-- Step 3: drop the pre-aggregated counts table (superseded by the event log)
DROP TABLE IF EXISTS "document_export_counts";
