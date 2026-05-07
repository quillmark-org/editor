/**
 * GET /api/documents/[id]/metadata - Get document metadata only (no content)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { documentService } from '$lib/server/services/documents';
import { requireAuth } from '$lib/server/utils/auth';
import { handleServiceError, validateUUID } from '$lib/server/utils/api';

export const GET: RequestHandler = async (event) => {
	try {
		const documentId = event.params.id;

		// Validate UUID format
		const uuidError = validateUUID(documentId, 'document_id');
		if (uuidError) return uuidError;

		const user = await requireAuth(event);

		const metadata = await documentService.getDocumentMetadata({
			user_id: user.id,
			document_id: documentId
		});

		return json(metadata);
	} catch (error) {
		return handleServiceError(error);
	}
};
