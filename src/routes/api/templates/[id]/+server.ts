/**
 * GET /api/templates/[id] - Template detail
 * PUT /api/templates/[id] - Update metadata (owner only)
 * DELETE /api/templates/[id] - Unpublish (owner only)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTemplateLibraryService } from '$lib/server/services/templates';
import { requireAuth } from '$lib/server/utils/auth';
import { handleServiceError, validateUUID } from '$lib/server/utils/api';
import { parseUpdateTemplateRequest } from '$lib/server/utils/request-schemas';
import {
	applyCdnCacheHeaders,
	CACHE_TEMPLATE_DETAIL,
	makeETag,
	checkETag
} from '$lib/server/utils/cdn-cache';

export const GET: RequestHandler = async (event) => {
	try {
		const id = event.params.id;

		const invalid = validateUUID(id);
		if (invalid) return invalid;

		const service = getTemplateLibraryService();
		// Always pass null for userId — star status is resolved via
		// GET /api/templates/[id]/star so this response is user-independent
		// and safe to serve from the CDN shared cache.
		const template = await service.getTemplate(id, null);

		const etag = makeETag(template.content_hash, template.updated_at);
		const notModified = checkETag(event.request, etag);
		if (notModified) return notModified;

		const response = json(template);
		response.headers.set('ETag', etag);
		applyCdnCacheHeaders(response, CACHE_TEMPLATE_DETAIL);

		return response;
	} catch (error) {
		return handleServiceError(error);
	}
};

export const PUT: RequestHandler = async (event) => {
	try {
		const user = await requireAuth(event);
		const id = event.params.id;

		const invalid = validateUUID(id);
		if (invalid) return invalid;

		const body = await event.request.json();
		const validated = parseUpdateTemplateRequest(body);
		if (validated instanceof Response) return validated;

		const service = getTemplateLibraryService();
		const template = await service.updateTemplateMetadata(user.id, id, validated);

		return json(template);
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
		await service.unpublishTemplate(user.id, id);

		return json({ success: true });
	} catch (error) {
		return handleServiceError(error);
	}
};
