-- Migration: ephemeral_documents (claim-flow design)
--
-- Short-lived drafts created by anonymous MCP `create_document` calls.
-- Owner_id starts NULL with a 5-minute claim deadline; the first
-- authenticated viewer of /doc/ephemeral/<id> claims atomically (owner_id
-- and claimed_at set, expires_at bumped to +1 h). Promotion copies the
-- row into `documents` and deletes the ephemeral. Rows past expires_at
-- are removed by /api/cron/expire-ephemeral-documents.
--
-- A prior table of the same name was dropped in
-- 0002_remove_ephemeral_documents.sql; the design here is greenfield
-- (separate table from documents, no shared flag).

CREATE TABLE IF NOT EXISTS "ephemeral_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"name" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"content_size_bytes" integer NOT NULL,
	"author_display_name" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ephemeral_documents_content_size_check" CHECK ("content_size_bytes" <= 524288)
);
--> statement-breakpoint
ALTER TABLE "ephemeral_documents" ADD CONSTRAINT "ephemeral_documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ephemeral_documents_owner_id_idx" ON "ephemeral_documents" USING btree ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ephemeral_documents_expires_at_idx" ON "ephemeral_documents" USING btree ("expires_at");
