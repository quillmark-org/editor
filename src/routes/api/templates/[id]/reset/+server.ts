/**
 * PUT /api/templates/[id]/reset - Reset linked document to published snapshot (owner only)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTemplateLibraryService } from '$lib/server/services/templates';
import { requireAuth } from '$lib/server/utils/auth';
import { handleServiceError, validateUUID } from '$lib/server/utils/api';

export const PUT: RequestHandler = async (event) => {
	try {
		const user = await requireAuth(event);
		const id = event.params.id;

		const invalid = validateUUID(id);
		if (invalid) return invalid;

		const service = getTemplateLibraryService();
		await service.resetTemplateToPublished(user.id, id);

		return json({ success: true });
	} catch (error) {
		return handleServiceError(error);
	}
};
