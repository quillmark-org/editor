/**
 * POST /api/templates/[id]/star - Star a template
 * DELETE /api/templates/[id]/star - Unstar a template
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTemplateLibraryService } from '$lib/server/services/templates';
import { requireAuth } from '$lib/server/utils/auth';
import { handleServiceError, validateUUID } from '$lib/server/utils/api';

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireAuth(event);
		const id = event.params.id;

		const invalid = validateUUID(id);
		if (invalid) return invalid;

		const service = getTemplateLibraryService();
		const result = await service.starTemplate(user.id, id);

		return json(result);
	} catch (error) {
		return handleServiceError(error);
	}
};

export const DELETE: RequestHandler = async (event) => {
	try {
		const user = await requireAuth(event);
		const id = event.params.id;

		const invalid = validateUUID(id);
		if (invalid) return invalid;

		const service = getTemplateLibraryService();
		const result = await service.unstarTemplate(user.id, id);

		return json(result);
	} catch (error) {
		return handleServiceError(error);
	}
};
