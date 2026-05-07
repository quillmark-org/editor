/**
 * GET /api/documents/[id] - Get document with content
 * PUT /api/documents/[id] - Update document content
 * DELETE /api/documents/[id] - Delete document
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { documentService } from '$lib/server/services/documents';
import { requireAuth } from '$lib/server/utils/auth';
import { handleServiceError, validateUUID } from '$lib/server/utils/api';
import { parseUpdateDocumentRequest } from '$lib/server/utils/request-schemas';

export const GET: RequestHandler = async (event) => {
	try {
		const documentId = event.params.id;

		// Validate UUID format
		const uuidError = validateUUID(documentId, 'document_id');
		if (uuidError) return uuidError;

		const user = await requireAuth(event);

		const document = await documentService.getDocumentContent({
			user_id: user.id,
			document_id: documentId
		});

		return json(document);
	} catch (error) {
		return handleServiceError(error);
	}
};

export const PUT: RequestHandler = async (event) => {
	try {
		const documentId = event.params.id;

		// Validate UUID format
		const uuidError = validateUUID(documentId, 'document_id');
		if (uuidError) return uuidError;

		const user = await requireAuth(event);
		const body = await event.request.json();
		const validated = parseUpdateDocumentRequest(body);
		if (validated instanceof Response) return validated;
		const { content, name, is_public } = validated;
		const result = await documentService.updateDocument({
			user_id: user.id,
			document_id: documentId,
			content,
			name,
			is_public
		});

		return json(result);
	} catch (error) {
		return handleServiceError(error);
	}
};

export const DELETE: RequestHandler = async (event) => {
	try {
		const documentId = event.params.id;

		// Validate UUID format
		const uuidError = validateUUID(documentId, 'document_id');
		if (uuidError) return uuidError;

		const user = await requireAuth(event);

		await documentService.deleteDocument({ user_id: user.id, document_id: documentId });

		return json({ success: true }, { status: 200 });
	} catch (error) {
		return handleServiceError(error);
	}
};
