/**
 * Ephemeral Document Service
 *
 * Short-lived drafts created by anonymous MCP `create_document` calls (and
 * any other future caller). Creation is unauthenticated: the row starts
 * with owner_id = null and a 5-minute claim deadline. The first
 * authenticated viewer of /ephemeral/<id> claims it (atomic CAS),
 * which sets owner_id and bumps expires_at to +1 h. Subsequent
 * non-claimant authed viewers see the "claimed by another account" page;
 * unauthed viewers get redirected to sign-in.
 *
 * Promotion (save-to-account) is owner-only and copies the row into
 * `documents`, deleting the ephemeral. Cron sweep removes anything past
 * its (dynamic) expires_at.
 */

import { eq, and, lt, gte, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db';
import type { EphemeralDocument } from '$lib/server/db/schema';
import { mapDrizzleError } from '$lib/server/db/errors';
import { rethrowUnless, AppError } from '$lib/errors';
import { DocumentError } from '$lib/services/documents/types';
import { DocumentValidator } from '$lib/services/documents/document-validator';
import { computeContentHash } from '$lib/server/utils/content-hash';

export const EPHEMERAL_UNCLAIMED_TTL_MS = 5 * 60 * 1000;
export const EPHEMERAL_CLAIMED_TTL_MS = 60 * 60 * 1000;
// Rows past expires_at are unreadable but kept around as tombstones so late
// visitors see "Document Expired" instead of an ambiguous 404. The sweep
// purges only after this grace window past expires_at.
export const EPHEMERAL_TOMBSTONE_GRACE_MS = 24 * 60 * 60 * 1000;

// Naive global rate limit on ephemeral creation. Derived from
// ephemeral_documents.created_at — the table is TTL-bounded so a scan of the
// trailing-60s window is cheap. Non-atomic with the subsequent INSERT, so a
// burst can overshoot by N concurrent requests; acceptable as a floor-level
// guard against /mcp create_document floods.
export const EPHEMERAL_CREATE_RATE_LIMIT_PER_MIN = 120;
const EPHEMERAL_CREATE_RATE_LIMIT_WINDOW_MS = 60_000;

export interface CreateEphemeralInput {
	name: string;
	content: string;
	authorDisplayName?: string;
}

export interface CreateEphemeralResult {
	id: string;
	claimDeadline: Date;
}

export type EphemeralViewResult =
	| { kind: 'owned'; doc: EphemeralDocument }
	| { kind: 'claimed_by_other' }
	| { kind: 'expired' }
	| { kind: 'not_found' };

/**
 * Create an unclaimed ephemeral document. No `ownerId` — the row will
 * be claimed later by the first authenticated viewer of the returned URL.
 */
export async function createEphemeralDocument(
	input: CreateEphemeralInput
): Promise<CreateEphemeralResult> {
	const { name, content, authorDisplayName } = input;

	DocumentValidator.validateName(name);
	DocumentValidator.validateContent(content);

	const contentSizeBytes = DocumentValidator.getByteLength(content);
	const expiresAt = new Date(Date.now() + EPHEMERAL_UNCLAIMED_TTL_MS);

	try {
		const db = await getDb();

		const windowStart = new Date(Date.now() - EPHEMERAL_CREATE_RATE_LIMIT_WINDOW_MS);
		const [{ count: recentCount }] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(schema.ephemeralDocuments)
			.where(gte(schema.ephemeralDocuments.createdAt, windowStart));
		if (recentCount >= EPHEMERAL_CREATE_RATE_LIMIT_PER_MIN) {
			throw new DocumentError(
				'rate_limited',
				'Ephemeral document creation rate limit exceeded',
				429
			);
		}

		const [row] = await db
			.insert(schema.ephemeralDocuments)
			.values({
				ownerId: null,
				name,
				content,
				contentSizeBytes,
				authorDisplayName: authorDisplayName ?? null,
				expiresAt
			})
			.returning();

		return { id: row.id, claimDeadline: row.expiresAt };
	} catch (error) {
		rethrowUnless(error, AppError, mapDrizzleError);
	}
}

/**
 * Atomically claim an unclaimed ephemeral document for `userId` and bump
 * its expires_at to +1 h. Returns the resulting view. If the row is
 * already claimed by someone else, expired, or missing, returns the
 * appropriate non-owned variant.
 *
 * Re-entrant for the same claimant: a user who has already claimed will
 * receive their own row back without further mutation.
 */
export async function claimEphemeralDocument(params: {
	userId: string;
	id: string;
}): Promise<EphemeralViewResult> {
	const { userId, id } = params;
	const now = new Date();
	const newExpiresAt = new Date(now.getTime() + EPHEMERAL_CLAIMED_TTL_MS);

	try {
		const db = await getDb();

		// Single UPDATE … WHERE owner_id IS NULL AND expires_at > now() so the
		// claim is atomic against concurrent visitors. Returns 0 rows when
		// already-claimed-by-someone-else OR expired OR missing — the caller
		// disambiguates with a follow-up SELECT.
		const claimed = await db
			.update(schema.ephemeralDocuments)
			.set({ ownerId: userId, claimedAt: now, expiresAt: newExpiresAt })
			.where(
				and(
					eq(schema.ephemeralDocuments.id, id),
					isNull(schema.ephemeralDocuments.ownerId),
					sql`${schema.ephemeralDocuments.expiresAt} > now()`
				)
			)
			.returning();

		if (claimed.length === 1) {
			return { kind: 'owned', doc: claimed[0] };
		}

		const [existing] = await db
			.select()
			.from(schema.ephemeralDocuments)
			.where(eq(schema.ephemeralDocuments.id, id));

		if (!existing) return { kind: 'not_found' };
		if (existing.expiresAt.getTime() <= Date.now()) return { kind: 'expired' };
		if (existing.ownerId === userId) return { kind: 'owned', doc: existing };
		return { kind: 'claimed_by_other' };
	} catch (error) {
		rethrowUnless(error, AppError, mapDrizzleError);
	}
}

/**
 * Promote an ephemeral document into the canonical `documents` table.
 * Owner-only. Transactional: the DELETE-RETURNING serves as the existence,
 * ownership, and liveness guard; the returned row is then copied into
 * `documents`. Race-safe against concurrent expiration.
 */
export async function promoteEphemeralDocument(params: {
	userId: string;
	id: string;
}): Promise<{ id: string }> {
	const { userId, id } = params;

	try {
		const db = await getDb();
		return await db.transaction(async (tx) => {
			const [eph] = await tx
				.delete(schema.ephemeralDocuments)
				.where(
					and(
						eq(schema.ephemeralDocuments.id, id),
						eq(schema.ephemeralDocuments.ownerId, userId),
						sql`${schema.ephemeralDocuments.expiresAt} > now()`
					)
				)
				.returning();

			if (!eph) {
				throw new DocumentError('not_found', 'Ephemeral document not found', 404);
			}

			const [created] = await tx
				.insert(schema.documents)
				.values({
					ownerId: eph.ownerId!,
					name: eph.name,
					content: eph.content,
					contentSizeBytes: eph.contentSizeBytes,
					contentHash: computeContentHash(eph.content)
				})
				.returning();

			return { id: created.id };
		});
	} catch (error) {
		rethrowUnless(error, AppError, mapDrizzleError);
	}
}

/**
 * Delete every ephemeral document past its tombstone purge deadline
 * (expires_at + EPHEMERAL_TOMBSTONE_GRACE_MS). Rows past expires_at but
 * still within the grace window are retained so late visitors get a clear
 * "Document Expired" page instead of a 404. Idempotent.
 */
export async function expireEphemeralDocuments(): Promise<number> {
	try {
		const db = await getDb();
		const purgeBefore = new Date(Date.now() - EPHEMERAL_TOMBSTONE_GRACE_MS);
		const deleted = await db
			.delete(schema.ephemeralDocuments)
			.where(lt(schema.ephemeralDocuments.expiresAt, purgeBefore))
			.returning();
		return deleted.length;
	} catch (error) {
		rethrowUnless(error, AppError, mapDrizzleError);
	}
}
