/**
 * Drizzle ORM Database Schema
 * Defines all tables for the application using Drizzle ORM.
 *
 * Tables:
 * - Auth.js: users, accounts (managed by @auth/drizzle-adapter)
 * - App: user_profiles, documents
 */

import {
	pgTable,
	uuid,
	varchar,
	text,
	timestamp,
	boolean,
	integer,
	jsonb,
	primaryKey,
	index,
	check,
	date,
	uniqueIndex,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { AdapterAccount } from '@auth/core/adapters';

// ============================================================================
// Auth.js Tables (managed by @auth/drizzle-adapter)
// ============================================================================

/**
 * Users table - Auth.js managed + App profile data
 * Core user identity for authentication
 *
 * Note: email is NOT unique to allow independent OAuth accounts.
 * Each OAuth provider login creates a separate user account.
 * This prevents account hijacking via email matching.
 */
export const users = pgTable('users', {
	id: uuid('id').defaultRandom().primaryKey(),
	email: varchar('email', { length: 255 }).notNull(), // No unique constraint
	name: text('name'),
	image: text('image'),
	emailVerified: timestamp('emailVerified', { withTimezone: true, mode: 'date' }),
	// App-specific fields (merged from user_profiles)
	profile: jsonb('profile'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
});

/**
 * Accounts table - Auth.js managed
 * OAuth provider accounts linked to users
 */
export const accounts = pgTable(
	'accounts',
	{
		userId: uuid('userId')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		type: text('type').$type<AdapterAccount['type']>().notNull(),
		provider: text('provider').notNull(),
		providerAccountId: text('providerAccountId').notNull(),
		refresh_token: text('refresh_token'),
		access_token: text('access_token'),
		expires_at: integer('expires_at'),
		token_type: text('token_type'),
		scope: text('scope'),
		id_token: text('id_token'),
		session_state: text('session_state')
	},
	(account) => [
		primaryKey({ columns: [account.provider, account.providerAccountId] }),
		index('accounts_user_id_idx').on(account.userId)
	]
);

// ============================================================================
// Application Tables
// ============================================================================

/**
 * Documents table
 * User-owned documents with content storage
 *
 * Indexes:
 * - owner_id: For listing user's documents
 * - is_public: For public document queries
 *
 * Constraints:
 * - content_size_bytes must be <= 524288 (512KB)
 */
export const documents = pgTable(
	'documents',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: varchar('name', { length: 255 }).notNull(),
		content: text('content').notNull(),
		contentSizeBytes: integer('content_size_bytes').notNull(),
		isPublic: boolean('is_public').default(false).notNull(),
		contentHash: text('content_hash'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
	},
	(table) => [
		index('documents_owner_id_idx').on(table.ownerId),
		index('documents_is_public_idx').on(table.isPublic),
		check('documents_content_size_check', sql`${table.contentSizeBytes} <= 524288`)
	]
);

/**
 * Ephemeral documents table
 * Short-lived drafts created on a user's behalf by MCP-authenticated agents.
 * Owner-only read/promote; expired or promoted rows are removed by the cron
 * sweep at /api/cron/expire-ephemeral-documents.
 *
 * Indexes:
 * - owner_id: For owner-scoped lookups
 * - expires_at: For the expiration sweep
 *
 * Constraints:
 * - content_size_bytes must be <= 524288 (512KB), matching documents
 */
export const ephemeralDocuments = pgTable(
	'ephemeral_documents',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		// Nullable while unclaimed. The first authenticated viewer of
		// /ephemeral/<id> stamps owner_id atomically (see
		// claimEphemeralDocument); subsequent non-claimant viewers get the
		// "claimed by another account" page.
		ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
		name: varchar('name', { length: 255 }).notNull(),
		content: text('content').notNull(),
		contentSizeBytes: integer('content_size_bytes').notNull(),
		authorDisplayName: varchar('author_display_name', { length: 100 }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
		claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
		// Unified delete-after timestamp. +5 min from creation while unclaimed,
		// bumped to +1 h on claim, deleted immediately on save-to-account.
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull()
	},
	(table) => [
		index('ephemeral_documents_owner_id_idx').on(table.ownerId),
		index('ephemeral_documents_expires_at_idx').on(table.expiresAt),
		check('ephemeral_documents_content_size_check', sql`${table.contentSizeBytes} <= 524288`)
	]
);

// ============================================================================
// Template Library Tables
// ============================================================================

/**
 * Templates table
 * Published document snapshots decoupled from the source document after publish.
 * Templates are never deleted, only set is_published = false.
 */
export const templates = pgTable(
	'templates',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id),
		documentId: uuid('document_id').references((): AnyPgColumn => documents.id, {
			onDelete: 'set null'
		}),
		title: text('title').notNull(),
		description: text('description').notNull(),
		content: text('content').notNull(),
		contentHash: text('content_hash'),
		quillRef: text('quill_ref'),
		isPublished: boolean('is_published').default(true).notNull(),
		starCount: integer('star_count').default(0).notNull(),
		importCount: integer('import_count').default(0).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('templates_document_id_idx').on(table.documentId),
		index('templates_owner_id_idx').on(table.ownerId),
		index('templates_is_published_idx').on(table.isPublished),
		index('templates_star_count_idx').on(table.starCount),
		check('templates_star_count_non_negative_check', sql`${table.starCount} >= 0`),
		check('templates_import_count_non_negative_check', sql`${table.importCount} >= 0`)
	]
);

/**
 * Template stars table
 * Tracks which users have starred which templates.
 */
export const templateStars = pgTable(
	'template_stars',
	{
		templateId: uuid('template_id')
			.notNull()
			.references(() => templates.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		starredAt: timestamp('starred_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
	},
	(table) => [primaryKey({ columns: [table.templateId, table.userId] })]
);

/**
 * Template import events table
 * Append-only event stream of template import actions.
 * Used as the source of truth for template import analytics.
 */
export const templateImportEvents = pgTable(
	'template_import_events',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		templateId: uuid('template_id')
			.notNull()
			.references(() => templates.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
	},
	(table) => [
		index('template_import_events_template_id_idx').on(table.templateId),
		index('template_import_events_user_id_idx').on(table.userId),
		index('template_import_events_document_id_idx').on(table.documentId),
		index('template_import_events_created_at_idx').on(table.createdAt)
	]
);

/**
 * Template user recents read-model
 * One row per (user, template) pair — upserted inside the importTemplate
 * transaction. Backs `GET /api/templates/recents` with an O(limit) read
 * (replaces a dedup scan over template_import_events).
 */
export const templateUserRecents = pgTable(
	'template_user_recents',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		templateId: uuid('template_id')
			.notNull()
			.references(() => templates.id, { onDelete: 'cascade' }),
		lastImportedAt: timestamp('last_imported_at', { withTimezone: true, mode: 'date' })
			.defaultNow()
			.notNull()
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.templateId] }),
		index('template_user_recents_user_last_imported_idx').on(table.userId, table.lastImportedAt)
	]
);

// ============================================================================
// Metrics Tables
// ============================================================================

/**
 * Metrics export rate limits table
 * Shared fixed-window limiter for /api/metrics/export.
 * One row per user per minute bucket.
 */
export const metricsExportRateLimits = pgTable(
	'metrics_export_rate_limits',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		windowStart: timestamp('window_start', { withTimezone: true, mode: 'date' }).notNull(),
		count: integer('count').notNull().default(1),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.windowStart] }),
		check('metrics_export_rate_limits_count_positive_check', sql`${table.count} > 0`),
		index('metrics_export_rate_limits_window_start_idx').on(table.windowStart)
	]
);

/**
 * User activity table
 * Records one row per user per calendar day (UTC) for DAU/WAU.
 * Append-only — inserts use ON CONFLICT DO NOTHING.
 *
 * Primary key: (user_id, date) enforces uniqueness.
 */
export const userActivity = pgTable(
	'user_activity',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		date: date('date', { mode: 'string' }).notNull()
	},
	(table) => [primaryKey({ columns: [table.userId, table.date] })]
);

/**
 * Document export events table
 * Append-only event stream of document export actions.
 * One row per export; documentId is nullable (set null if the document is deleted).
 * Single source of truth for all export analytics — replaces document_export_counts.
 *
 * Indexes:
 * - user_id: For per-user export history and daily count queries
 * - document_id: For per-document export history queries
 * - created_at: For time-range analytics
 */
export const documentExportEvents = pgTable(
	'document_export_events',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
	},
	(table) => [
		index('document_export_events_user_id_idx').on(table.userId),
		index('document_export_events_document_id_idx').on(table.documentId),
		index('document_export_events_created_at_idx').on(table.createdAt)
	]
);

// ============================================================================
// Beta Program Tables
// ============================================================================

/**
 * Beta notifications table
 * Tracks whether a user has been prompted to join the beta program and their response.
 * One row per user — created when the notification is shown.
 *
 * Primary key: user_id (each user is notified at most once)
 */
export const betaNotifications = pgTable('beta_notifications', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	response: varchar('response', { length: 20 }).notNull(), // 'accepted' | 'declined'
	notifiedAt: timestamp('notified_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	respondedAt: timestamp('responded_at', { withTimezone: true, mode: 'date' })
});

// ============================================================================
// Type Exports (infer types from schema)
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export type EphemeralDocument = typeof ephemeralDocuments.$inferSelect;
export type NewEphemeralDocument = typeof ephemeralDocuments.$inferInsert;

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type TemplateStar = typeof templateStars.$inferSelect;
export type TemplateImportEvent = typeof templateImportEvents.$inferSelect;
export type NewTemplateImportEvent = typeof templateImportEvents.$inferInsert;

export type TemplateUserRecent = typeof templateUserRecents.$inferSelect;
export type NewTemplateUserRecent = typeof templateUserRecents.$inferInsert;

export type MetricsExportRateLimit = typeof metricsExportRateLimits.$inferSelect;
export type NewMetricsExportRateLimit = typeof metricsExportRateLimits.$inferInsert;

export type UserActivity = typeof userActivity.$inferSelect;
export type NewUserActivity = typeof userActivity.$inferInsert;

export type DocumentExportEvent = typeof documentExportEvents.$inferSelect;
export type NewDocumentExportEvent = typeof documentExportEvents.$inferInsert;

export type BetaNotification = typeof betaNotifications.$inferSelect;
export type NewBetaNotification = typeof betaNotifications.$inferInsert;
