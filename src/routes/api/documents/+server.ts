/**
 * POST /api/documents - Create new document
 * GET /api/documents - List user's documents
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { documentService } from '$lib/server/services/documents';
import { requireAuth } from '$lib/server/utils/auth';
import { handleServiceError } from '$lib/server/utils/api';
import { parsePaginationParams } from '$lib/server/utils/request-validation';
import { parseCreateDocumentRequest } from '$lib/server/utils/request-schemas';

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireAuth(event);
		const body = await event.request.json();
		const validated = parseCreateDocumentRequest(body);
		if (validated instanceof Response) return validated;

		const document = await documentService.createDocument({
			user_id: user.id,
			...validated
		});

		return json(document, { status: 201 });
	} catch (error) {
		return handleServiceError(error);
	}
};

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireAuth(event);
		const url = new URL(event.request.url);
		const { limit, offset } = parsePaginationParams(url.searchParams, {
			defaultLimit: 50,
			maxLimit: 100
		});

		const result = await documentService.listUserDocuments({
			user_id: user.id,
			limit,
			offset
		});

		return json(result);
	} catch (error) {
		return handleServiceError(error);
	}
};
