import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { handle as authHandle } from '$lib/server/auth';
import { getServerConfig } from '$lib/config/load.server';
import { triggerServerStartup } from '$lib/server/startup';

/**
 * Guest Mode Control Handler.
 * Enforces authentication when auth.guestMode is false in deployment YAML.
 */
const guestControlHandle: Handle = async ({ event, resolve }) => {
	const { pathname, search } = event.url;

	if (!getServerConfig().auth.guestMode) {
		const session = await event.locals.auth();

		// If authenticated, proceed
		if (session?.user) {
			return resolve(event);
		}

		// List of routes that require strict authentication
		const restrictedRoutes = [
			pathname === '/', // Editor / Home
			pathname.startsWith('/doc/') // Public Documents
		];

		// List of routes that are always allowed (even if guest mode is disabled)
		// - /auth: Authentication flows
		const isAllowed = pathname === '/auth' || pathname.startsWith('/auth/');

		if (restrictedRoutes.some(Boolean) && !isAllowed) {
			const fromUrl = /^\/[^/]/.test(pathname + search) ? pathname + search : '/';
			throw redirect(303, `/signin?callbackUrl=${encodeURIComponent(fromUrl)}`);
		}
	}

	return resolve(event);
};

/**
 * Composed handle: Auth.js → Guest Control
 */
const composedHandle = sequence(authHandle, guestControlHandle);

triggerServerStartup();

export const handle: Handle = async ({ event, resolve }) => {
	// Reject non-read methods at the hook level so CORS preflight
	// only advertises what is actually reachable.
	if (event.request.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: {
				'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
				'Access-Control-Max-Age': '86400'
			}
		});
	}

	const response = await composedHandle({ event, resolve });

	// Restrict the advertised CORS method list to what is actually allowed.
	response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');

	// Force service worker script revalidation so clients don't keep a stale worker.
	if (event.url.pathname === '/service-worker.js') {
		response.headers.set('cache-control', 'no-cache, must-revalidate');
	}

	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('content-security-policy', "frame-ancestors 'none'");
	response.headers.delete('access-control-allow-origin');

	return response;
};
