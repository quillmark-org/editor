/**
 * GET /api/templates/by-document/[documentId] - Template detail by document ID
 * Requires authentication — only the document owner can look up their template.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTemplateLibraryService } from '$lib/server/services/templates';
import { requireAuth } from '$lib/server/utils/auth';
import { handleServiceError, validateUUID } from '$lib/server/utils/api';

export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireAuth(event);
		const documentId = event.params.documentId;

		const invalid = validateUUID(documentId);
		if (invalid) return invalid;

		const service = getTemplateLibraryService();
		const template = await service.getTemplateByDocumentId(documentId, user.id);

		return json(template);
	} catch (error) {
		return handleServiceError(error);
	}
};
