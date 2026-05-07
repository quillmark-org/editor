/**
 * GET /api/public/documents/[id] - Get public document (no authentication required)
 * Returns 404 for non-existent OR private documents (ambiguous by design)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { documentService } from '$lib/server/services/documents';
import { validateUUID } from '$lib/server/utils/api';
import { logAmbiguousResponse } from '$lib/server/utils/ambiguous-response-logging';

export const GET: RequestHandler = async (event) => {
	const documentId = event.params.id;

	// Validate UUID format
	const uuidError = validateUUID(documentId, 'document_id');
	if (uuidError) return uuidError;

	try {
		const publicDoc = await documentService.getPublicDocument(documentId);

		if (!publicDoc) {
			// Return 404 for both non-existent and private documents (security)
			const correlationId = logAmbiguousResponse(event, {
				route: '/api/public/documents/[id]',
				externalStatus: 404,
				reason: 'not_found_or_private_document',
				resourceId: documentId
			});
			return json(
				{ error: 'not_found', message: 'Document not found' },
				{ status: 404, headers: { 'x-correlation-id': correlationId } }
			);
		}

		return json(publicDoc);
	} catch (error) {
		// Keep externally ambiguous 404 while logging server-only diagnostics
		const correlationId = logAmbiguousResponse(event, {
			route: '/api/public/documents/[id]',
			externalStatus: 404,
			reason: 'exception_during_public_document_fetch',
			error,
			resourceId: documentId
		});
		return json(
			{ error: 'not_found', message: 'Document not found' },
			{ status: 404, headers: { 'x-correlation-id': correlationId } }
		);
	}
};
