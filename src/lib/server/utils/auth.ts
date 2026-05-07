/**
 * Authentication Middleware Utilities
 * Helper functions for protecting API routes
 *
 * Uses Auth.js session via locals.auth()
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { errorResponse } from '$lib/server/utils/api';
import { getServerConfig } from '$lib/config/load.server';
import type { User } from '$lib/services/auth';

/**
 * Map Auth.js session user to our User type
 * Auth.js user has: id, name, email, image
 * Our User type has additional fields we provide defaults for
 */
function mapSessionToUser(sessionUser: {
	id?: string | null;
	name?: string | null;
	email?: string | null;
	image?: string | null;
}): User {
	if (!sessionUser.id) {
		throw errorResponse('unauthorized', 'Session user id is required', 401);
	}
	if (!sessionUser.email) {
		throw errorResponse('unauthorized', 'Session user email is required', 401);
	}

	const now = new Date().toISOString();
	return {
		id: sessionUser.id,
		email: sessionUser.email,
		dodid: null,
		profile: {
			name: sessionUser.name,
			image: sessionUser.image
		},
		created_at: now,
		updated_at: now
	};
}

/**
 * Require authentication for a request
 * Returns user if authenticated, otherwise throws error response
 */
export async function requireAuth(event: RequestEvent): Promise<User> {
	const session = await event.locals.auth();

	if (!session?.user?.id) {
		throw errorResponse('unauthorized', 'Authentication required', 401);
	}

	return mapSessionToUser(session.user);
}

/**
 * Optional authentication - returns user if authenticated, null otherwise
 */
export async function optionalAuth(event: RequestEvent): Promise<User | null> {
	const session = await event.locals.auth();

	if (!session?.user?.id) {
		return null;
	}

	return mapSessionToUser(session.user);
}

/**
 * Guest-mode-aware authentication.
 * When guest mode is enabled, unauthenticated users browse anonymously.
 * When disabled, authentication is required (throws 401).
 */
export async function guestAwareAuth(event: RequestEvent): Promise<User | null> {
	if (!getServerConfig().auth.guestMode) {
		return requireAuth(event);
	}
	return optionalAuth(event);
}

/**
 * Get raw session from request
 * Useful when you need the full session object, not just the user
 */
export async function getSession(event: RequestEvent) {
	return event.locals.auth();
}

/**
 * Require a valid `Authorization: Bearer <CRON_SECRET>` header on a request.
 *
 * Uses constant-time comparison (`timingSafeEqual`) guarded by a length check
 * (required because `timingSafeEqual` throws on length mismatch).
 *
 * Returns `null` on success (caller continues) or a `Response` to short-circuit
 * the handler on failure. When `features.cron.enabled` is false the routes
 * appear unmounted (404). Auth failures return `{ error: 'unauthorized' }`
 * with status 401, including when `CRON_SECRET` is unset on an enabled
 * deployment (which the boot-time cascade should already have caught).
 */
export function requireCronAuth(request: Request): Response | null {
	if (!getServerConfig().features.cron.enabled) {
		return json({ error: 'not_found' }, { status: 404 });
	}

	if (!env.CRON_SECRET) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	// Verify secret using constant-time comparison to prevent timing attacks
	const authHeader = request.headers.get('authorization');
	const expected = `Bearer ${env.CRON_SECRET}`;
	if (
		!authHeader ||
		authHeader.length !== expected.length ||
		!timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
	) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	return null;
}
