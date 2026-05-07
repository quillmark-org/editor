/**
 * GET /api/templates/recents - list recently used templates for authenticated user.
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
		const q = event.url.searchParams.get('q')?.trim();
		const limitRaw = event.url.searchParams.get('limit');
		const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
		const limit = Number.isFinite(limitParsed) ? limitParsed : undefined;
		const result = await service.listRecentTemplates(user.id, {
			q: q || undefined,
			limit
		});
		return json(result);
	} catch (error) {
		return handleServiceError(error);
	}
};
