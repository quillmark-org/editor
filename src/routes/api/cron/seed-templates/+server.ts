import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireCronAuth } from '$lib/server/utils/auth';
import { syncOfficialTemplatesFromData } from '$lib/server/services/templates/seed';
import { loadManifestViaHTTP, loadTemplateViaHTTP } from '$lib/server/services/templates/loader';
import { getSelfURL } from '$lib/server/utils/api';

export const GET: RequestHandler = async (event) => {
	const authFailure = requireCronAuth(event.request);
	if (authFailure) return authFailure;

	try {
		const baseUrl = getSelfURL(event);
		const manifest = await loadManifestViaHTTP(baseUrl);

		const synced = await syncOfficialTemplatesFromData(manifest, (filename) =>
			loadTemplateViaHTTP(baseUrl, filename)
		);

		return json({
			success: true,
			synced,
			message: `Synced ${synced} official templates`
		});
	} catch (error) {
		console.error('[Cron] Template seed error:', error);
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};
