/**
 * GET /api/cron/expire-ephemeral-documents
 *
 * Sweep handler: deletes ephemeral_documents rows where expires_at < now().
 * Authenticated by `Authorization: Bearer <CRON_SECRET>`. Idempotent —
 * calling more often than the TTL is harmless, deleting fewer rows on average.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireCronAuth } from '$lib/server/utils/auth';
import { expireEphemeralDocuments } from '$lib/server/services/ephemeral-documents';

export const GET: RequestHandler = async (event) => {
	const authFailure = requireCronAuth(event.request);
	if (authFailure) return authFailure;

	try {
		const deleted = await expireEphemeralDocuments();
		return json({ success: true, deleted });
	} catch (error) {
		console.error('[Cron] Ephemeral document expiry error:', error);
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};
