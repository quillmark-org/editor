import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireCronAuth } from '$lib/server/utils/auth';
import { markTemplateOfficialByIdWithAppDb } from '$lib/server/services/templates/mark-template-official-db';
import { isValidUUID } from '$lib/server/utils/api';

/**
 * Cron / ops hook: mark a user-published template as official by template UUID.
 *
 * Query: `template_id` (required UUID)
 * Auth: `Authorization: Bearer <CRON_SECRET>`
 */
export const GET: RequestHandler = async ({ request, url }) => {
	const authFailure = requireCronAuth(request);
	if (authFailure) return authFailure;

	const templateId = (url.searchParams.get('template_id') ?? '').trim();
	if (!templateId) {
		return json({ error: 'template_id query parameter is required' }, { status: 400 });
	}
	if (!isValidUUID(templateId)) {
		return json({ error: 'template_id must be a valid UUID' }, { status: 400 });
	}

	try {
		const result = await markTemplateOfficialByIdWithAppDb(templateId);
		const statusCode =
			result.status === 'marked_official' ? 200 : result.status === 'not_found' ? 404 : 409;

		return json(
			{
				success: result.status === 'marked_official',
				...result
			},
			{ status: statusCode }
		);
	} catch (error) {
		console.error('[Cron] mark-template-official error:', error);
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};
