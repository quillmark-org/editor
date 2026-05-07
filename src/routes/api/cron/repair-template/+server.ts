import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireCronAuth } from '$lib/server/utils/auth';
import { repairTemplateWithAppDb } from '$lib/server/services/templates/repair-template-db';
import { isValidUUID } from '$lib/server/utils/api';

function parseDryRunParam(raw: string | null): boolean {
	if (raw === null || raw === '') return false;
	const n = raw.trim().toLowerCase();
	if (n === 'true') return true;
	if (n === 'false') return false;
	return false;
}

/**
 * Cron / ops hook: repair a published template snapshot and its linked fork doc.
 *
 * Query: `template_id` (UUID), `dry_run` optional (`true`|`false`, default `false`).
 * Auth: `Authorization: Bearer <CRON_SECRET>` (see other `/api/cron/*` routes).
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

	const dryRun = parseDryRunParam(url.searchParams.get('dry_run'));

	try {
		const payload = await repairTemplateWithAppDb({ templateId, dryRun });
		return json({ success: true, ...payload });
	} catch (error) {
		console.error('[Cron] repair-template error:', error);
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};
