/**
 * Beta Program Service
 * Manages beta tester responses via the beta_notifications table.
 *
 * One row per user. Inserts set notified_at / responded_at; later preference
 * changes update response and responded_at only (notified_at stays first prompt time).
 */

import { getDb, schema } from '$lib/server/db';

export type BetaResponse = 'accepted' | 'declined';

/**
 * Record or update a user's beta program preference.
 */
async function recordResponse(userId: string, response: BetaResponse): Promise<void> {
	const db = await getDb();
	const now = new Date();

	await db
		.insert(schema.betaNotifications)
		.values({
			userId,
			response,
			notifiedAt: now,
			respondedAt: now
		})
		.onConflictDoUpdate({
			target: schema.betaNotifications.userId,
			set: {
				response,
				respondedAt: now
			}
		});
}

export const betaProgramService = {
	recordResponse
};
