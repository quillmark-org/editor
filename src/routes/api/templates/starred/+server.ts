/**
 * GET /api/templates/starred - List template IDs the current user has starred.
 *
 * Returns a lightweight set of IDs so the client can merge star state
 * into CDN-cached template detail responses without per-template round trips.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTemplateLibraryService } from '$lib/server/services/templates';
import { requireAuth } from '$lib/server/utils/auth';
import { handleServiceError } from '$lib/server/utils/api';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireAuth(event);
		const service = getTemplateLibraryService();
		const ids = await service.getStarredTemplateIds(user.id);

		return json({ ids });
	} catch (error) {
		return handleServiceError(error);
	}
};
