/**
 * POST /api/templates/[id]/import - Create document from template
 *
 * Body is optional: `{ name?: string }` to override the document name
 * (defaults to the template title). Content stays server-side; clients
 * don't re-upload what the server already has.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTemplateLibraryService } from '$lib/server/services/templates';
import { requireAuth } from '$lib/server/utils/auth';
import { errorResponse, handleServiceError, validateUUID } from '$lib/server/utils/api';

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireAuth(event);
		const id = event.params.id;

		const invalid = validateUUID(id);
		if (invalid) return invalid;

		let name: string | undefined;
		if (event.request.headers.get('content-length') !== '0' && event.request.body) {
			let body: unknown;
			try {
				body = await event.request.json();
			} catch {
				return errorResponse('validation_error', 'Request body must be valid JSON', 400);
			}
			if (body && typeof body === 'object' && !Array.isArray(body)) {
				const rawName = (body as { name?: unknown }).name;
				if (rawName !== undefined) {
					if (typeof rawName !== 'string') {
						return errorResponse('validation_error', 'name must be a string', 400);
					}
					name = rawName;
				}
			}
		}

		const service = getTemplateLibraryService();
		const result = await service.importTemplate(user.id, id, name);

		return json(result, { status: 201 });
	} catch (error) {
		return handleServiceError(error);
	}
};
