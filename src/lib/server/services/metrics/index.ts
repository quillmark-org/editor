/**
 * Metrics Service
 * Fire-and-forget writes for document_export_events and user_activity tables.
 * Failures are logged but never surface as user errors.
 */

import { getDb, schema } from '$lib/server/db';
import { sql } from 'drizzle-orm';

const EXPORT_RATE_LIMIT_MAX = 10;
const EXPORT_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Returns the current date as a UTC YYYY-MM-DD string.
 * All metrics are keyed on UTC dates — day boundaries are UTC midnight.
 */
function utcDateString(): string {
	return new Date().toISOString().split('T')[0];
}

/**
 * Record a document export (fire-and-forget).
 * Appends one row to document_export_events — the single source of truth for export analytics.
 * Call without awaiting — failures are logged, never thrown.
 */
export function recordExport(userId: string, documentId: string | null): void {
	_recordExport(userId, documentId).catch((err) => {
		console.error('[metrics] Failed to record export:', err);
	});
}

/**
 * Shared DB-backed export rate limiter.
 * Returns true when request is allowed, false when rejected.
 */
export async function allowExportRequest(userId: string): Promise<boolean> {
	const db = await getDb();
	const now = new Date();
	const windowStart = new Date(
		Math.floor(now.getTime() / EXPORT_RATE_LIMIT_WINDOW_MS) * EXPORT_RATE_LIMIT_WINDOW_MS
	);

	const result = await db.execute(sql`
		INSERT INTO metrics_export_rate_limits (user_id, window_start, count, updated_at)
		VALUES (${userId}::uuid, ${windowStart.toISOString()}::timestamptz, 1, ${now.toISOString()}::timestamptz)
		ON CONFLICT (user_id, window_start) DO UPDATE
		SET count = metrics_export_rate_limits.count + 1,
			updated_at = ${now.toISOString()}::timestamptz
		WHERE metrics_export_rate_limits.count < ${EXPORT_RATE_LIMIT_MAX}
		RETURNING count
	`);

	return result.rows.length > 0;
}

async function _recordExport(userId: string, documentId: string | null): Promise<void> {
	const db = await getDb();
	await db.insert(schema.documentExportEvents).values({ userId, documentId });
}

/**
 * Record user activity for today (fire-and-forget).
 * Uses ON CONFLICT DO NOTHING — safe to call repeatedly.
 * Call without awaiting — failures are logged, never thrown.
 */
export function recordActivity(userId: string): void {
	_recordActivity(userId).catch((err) => {
		console.error('[metrics] Failed to record activity:', err);
	});
}

async function _recordActivity(userId: string): Promise<void> {
	const db = await getDb();
	const today = utcDateString();
	await db.insert(schema.userActivity).values({ userId, date: today }).onConflictDoNothing();
}
