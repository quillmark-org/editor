/**
 * GET /api/templates - Browse template library
 * POST /api/templates - Publish a new template
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTemplateLibraryService } from '$lib/server/services/templates';
import { requireAuth, guestAwareAuth } from '$lib/server/utils/auth';
import { handleServiceError } from '$lib/server/utils/api';
import { parsePaginationParams } from '$lib/server/utils/request-validation';
import { parseCreateTemplateRequest } from '$lib/server/utils/request-schemas';
import type { ListTemplatesParams } from '$lib/server/services/templates/types';
import { ensureServerStartup } from '$lib/server/startup';

export const GET: RequestHandler = async (event) => {
	try {
		await ensureServerStartup();
		await guestAwareAuth(event);

		const url = event.url;
		const params: ListTemplatesParams = {};

		const q = url.searchParams.get('q');
		if (q) params.q = q;

		const quillRef = url.searchParams
			.get('quill_ref')
			?.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
		if (quillRef && quillRef.length > 0) {
			params.quillRef = quillRef;
		}

		const official = url.searchParams.get('official');
		if (official === 'true') params.official = true;
		if (official === 'false') params.official = false;

		const sort = url.searchParams.get('sort');
		if (sort && ['recommended', 'stars', 'imports', 'recent', 'alpha'].includes(sort)) {
			params.sort = sort as ListTemplatesParams['sort'];
		}

		const { limit, offset } = parsePaginationParams(url.searchParams, {
			defaultLimit: 100,
			maxLimit: 100
		});
		params.limit = limit;
		params.offset = offset;

		const service = getTemplateLibraryService();
		const result = await service.listTemplates(params);

		return json(result);
	} catch (error) {
		return handleServiceError(error);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireAuth(event);
		const body = await event.request.json();
		const validated = parseCreateTemplateRequest(body);
		if (validated instanceof Response) return validated;

		const service = getTemplateLibraryService();
		const template = await service.createTemplate(user.id, validated);

		return json(template, { status: 201 });
	} catch (error) {
		return handleServiceError(error);
	}
};
