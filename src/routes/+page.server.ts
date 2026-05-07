import type { PageServerLoad } from './$types';
import { getServerConfig } from '$lib/config/load.server';
import { documentService } from '$lib/server/services/documents/document-provider';

const feedbackSubmissionEnabled = getServerConfig().features.feedback.upstream !== 'none';

export const load: PageServerLoad = async (event) => {
	event.depends('app:documents');

	const { session } = await event.parent();

	if (session?.user?.id) {
		try {
			const result = await documentService.listUserDocuments({
				user_id: session.user.id,
				limit: 100,
				offset: 0
			});

			return {
				documents: result.documents,
				feedbackSubmissionEnabled
			};
		} catch (error) {
			console.error('[SSR] Failed to load documents:', error);

			return {
				documents: null,
				feedbackSubmissionEnabled
			};
		}
	}

	return {
		documents: null,
		feedbackSubmissionEnabled
	};
};
