/**
 * Public Document Page Server Load
 * Fetches public document data for read-only viewing
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { documentService } from '$lib/server/services/documents';

export const load: PageServerLoad = async (event) => {
	const documentId = event.params.id;

	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) {
		error(404, { message: 'Document not found' });
	}

	// Invalidation dependency
	event.depends(`app:document-${documentId}`);

	try {
		const publicDoc = await documentService.getPublicDocument(documentId);

		if (!publicDoc) {
			// Return 404 for both non-existent and private documents (security)
			error(404, {
				message: 'Document not found'
			});
		}

		return {
			document: publicDoc
		};
	} catch (err) {
		// Log error but return generic 404 to maintain ambiguity
		console.error('Error loading public document:', err);
		error(404, {
			message: 'Document not found'
		});
	}
};
