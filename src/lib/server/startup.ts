import { env } from '$env/dynamic/private';
import {
	syncOfficialTemplates,
	syncOfficialTemplatesFromData
} from '$lib/server/services/templates/seed';
import { loadManifestViaHTTP, loadTemplateViaHTTP } from '$lib/server/services/templates/loader';
import { getSelfURL } from '$lib/server/utils/api';

/** True when running inside a Vercel serverless function. */
const isVercel = !!env.VERCEL;

let startupPromise: Promise<void> | null = null;
let startupComplete = false;

/**
 * Performs one-time server startup work.
 * Safe to call from request handlers; work runs once per process.
 */
function startServerStartup(): Promise<void> {
	if (startupComplete) {
		return Promise.resolve();
	}

	if (!startupPromise) {
		startupPromise = (async () => {
			if (isVercel) {
				// On Vercel, static/ files live on the CDN, not the function filesystem.
				// Fetch templates via HTTP from the app's own origin instead.
				const baseUrl = getSelfURL();
				const manifest = await loadManifestViaHTTP(baseUrl);
				await syncOfficialTemplatesFromData(manifest, (filename) =>
					loadTemplateViaHTTP(baseUrl, filename)
				);
			} else {
				await syncOfficialTemplates();
			}
			startupComplete = true;
		})().catch((error) => {
			// Allow future calls to retry startup rather than permanently failing.
			startupPromise = null;
			throw error;
		});
	}

	return startupPromise;
}

export function triggerServerStartup(): void {
	void startServerStartup().catch((error) => {
		console.error('Server startup failed. Will retry on next startup trigger.', error);
	});
}

export async function ensureServerStartup(): Promise<void> {
	await startServerStartup();
}
