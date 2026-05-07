/**
 * POST /api/beta-program - Record user's response to the beta program notification
 *
 * Body: { response: "accepted" | "declined" }
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/utils/auth';
import { betaProgramService } from '$lib/server/services/beta-program';
import { handleServiceError } from '$lib/server/utils/api';

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireAuth(event);
		const body = await event.request.json();
		const response = body?.response;

		if (response !== 'accepted' && response !== 'declined') {
			return json(
				{ error: 'validation_error', message: 'response must be "accepted" or "declined"' },
				{ status: 400 }
			);
		}

		await betaProgramService.recordResponse(user.id, response);
		return json({ ok: true });
	} catch (error) {
		return handleServiceError(error);
	}
};
