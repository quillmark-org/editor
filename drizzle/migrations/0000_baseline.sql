CREATE TABLE IF NOT EXISTS "accounts" (
	"userId" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "beta_notifications" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"response" varchar(20) NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_export_counts" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "document_export_counts_user_id_day_pk" PRIMARY KEY("user_id","day"),
	CONSTRAINT "document_export_counts_count_non_negative_check" CHECK ("document_export_counts"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"content_size_bytes" integer NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_content_size_check" CHECK ("documents"."content_size_bytes" <= 524288)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metrics_export_rate_limits" (
	"user_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metrics_export_rate_limits_user_id_window_start_pk" PRIMARY KEY("user_id","window_start"),
	CONSTRAINT "metrics_export_rate_limits_count_positive_check" CHECK ("metrics_export_rate_limits"."count" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_import_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_stars" (
	"template_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"starred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_stars_template_id_user_id_pk" PRIMARY KEY("template_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"document_id" uuid,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text,
	"quill_ref" text,
	"is_published" boolean DEFAULT true NOT NULL,
	"star_count" integer DEFAULT 0 NOT NULL,
	"import_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_star_count_non_negative_check" CHECK ("templates"."star_count" >= 0),
	CONSTRAINT "templates_import_count_non_negative_check" CHECK ("templates"."import_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_activity" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	CONSTRAINT "user_activity_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" text,
	"image" text,
	"emailVerified" timestamp with time zone,
	"profile" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_userId_users_id_fk";--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_notifications" DROP CONSTRAINT IF EXISTS "beta_notifications_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "beta_notifications" ADD CONSTRAINT "beta_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_export_counts" DROP CONSTRAINT IF EXISTS "document_export_counts_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "document_export_counts" ADD CONSTRAINT "document_export_counts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_owner_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_export_rate_limits" DROP CONSTRAINT IF EXISTS "metrics_export_rate_limits_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "metrics_export_rate_limits" ADD CONSTRAINT "metrics_export_rate_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_import_events" DROP CONSTRAINT IF EXISTS "template_import_events_template_id_templates_id_fk";--> statement-breakpoint
ALTER TABLE "template_import_events" ADD CONSTRAINT "template_import_events_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_import_events" DROP CONSTRAINT IF EXISTS "template_import_events_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "template_import_events" ADD CONSTRAINT "template_import_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_import_events" DROP CONSTRAINT IF EXISTS "template_import_events_document_id_documents_id_fk";--> statement-breakpoint
ALTER TABLE "template_import_events" ADD CONSTRAINT "template_import_events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_stars" DROP CONSTRAINT IF EXISTS "template_stars_template_id_templates_id_fk";--> statement-breakpoint
ALTER TABLE "template_stars" ADD CONSTRAINT "template_stars_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_stars" DROP CONSTRAINT IF EXISTS "template_stars_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "template_stars" ADD CONSTRAINT "template_stars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" DROP CONSTRAINT IF EXISTS "templates_owner_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" DROP CONSTRAINT IF EXISTS "templates_document_id_documents_id_fk";--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity" DROP CONSTRAINT IF EXISTS "user_activity_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_owner_id_idx" ON "documents" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_is_public_idx" ON "documents" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metrics_export_rate_limits_window_start_idx" ON "metrics_export_rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_import_events_template_id_idx" ON "template_import_events" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_import_events_user_id_idx" ON "template_import_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_import_events_created_at_idx" ON "template_import_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "templates_document_id_idx" ON "templates" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_owner_id_idx" ON "templates" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_is_published_idx" ON "templates" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_star_count_idx" ON "templates" USING btree ("star_count");
