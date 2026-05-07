-- Migration: add template_user_recents read-model
--
-- Replaces the 500-row dedup + unbounded COUNT(DISTINCT) over
-- template_import_events that backed /api/templates/recents with an
-- O(limit) read from a (user_id, template_id) pair table, upserted
-- inside the importTemplate transaction.
--
-- See prose/security/API_VULNS.md — "Unbounded limit x 10 amplification
-- in GET /api/templates/recents".
--
-- No backfill: existing recents are accepted as lost. The events table
-- remains the append-only audit log and is not modified.

CREATE TABLE IF NOT EXISTS "template_user_recents" (
	"user_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"last_imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_user_recents_user_id_template_id_pk" PRIMARY KEY("user_id","template_id")
);
--> statement-breakpoint
ALTER TABLE "template_user_recents" ADD CONSTRAINT "template_user_recents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "template_user_recents" ADD CONSTRAINT "template_user_recents_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_user_recents_user_last_imported_idx" ON "template_user_recents" USING btree ("user_id","last_imported_at" DESC);
