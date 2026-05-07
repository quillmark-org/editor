/**
 * API Response Utilities
 * Helper functions for consistent API responses
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import { AppError } from '$lib/errors';
import { env } from '$env/dynamic/private';

/**
 * UUID validation regex (v4 + v5)
 * Matches format: xxxxxxxx-xxxx-[45]xxx-[89ab]xxx-xxxxxxxxxxxx
 *
 * Accepts both v4 and v5 UUIDs:
 *   - documents and user-created templates are v4 (crypto.randomUUID()).
 *   - official templates are v5, derived deterministically from a manifest
 *     id via uuidv5() in src/lib/server/services/templates/seed.ts.
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(id: string): boolean {
	return UUID_REGEX.test(id);
}

/**
 * Validate UUID and return error response if invalid
 * @param id - The ID to validate
 * @param paramName - The parameter name for error messages (default: 'id')
 * @returns null if valid, Response with 400 error if invalid
 */
export function validateUUID(id: string | undefined, paramName = 'id'): Response | null {
	if (!id || !isValidUUID(id)) {
		return json(
			{ error: 'validation_error', message: `Invalid ${paramName}: must be a valid UUID` },
			{ status: 400 }
		);
	}
	return null;
}

/**
 * Standard error response format
 */
export interface ErrorResponse {
	error: string;
	message: string;
}

/**
 * Create JSON error response
 */
export function errorResponse(code: string, message: string, status: number = 400) {
	return json({ error: code, message } as ErrorResponse, { status });
}

/**
 * Handle service errors (generic handler for all AppError subclasses)
 */
export function handleServiceError(error: unknown) {
	// If the error is already a Response (e.g. from requireAuth/errorResponse),
	// return it directly instead of wrapping it in a 500.
	if (error instanceof Response) {
		return error;
	}

	console.error('Service error:', error);

	if (error instanceof AppError) {
		return errorResponse(error.code, error.message, error.statusCode);
	}

	return errorResponse('unknown_error', 'An unexpected error occurred', 500);
}

/**
 * Canonical public origin for user-facing links.
 * Prefers ORIGIN so custom domains win over Vercel deployment URLs.
 * - With a request, use the actual request origin.
 * - Otherwise: ORIGIN > VERCEL_URL > localhost default.
 */
export function getOrigin(event?: RequestEvent): string {
	let url: string;
	if (event) {
		url = event.url.origin;
	} else if (env.ORIGIN) {
		url = env.ORIGIN;
	} else if (env.VERCEL && env.VERCEL_URL) {
		url = `https://${env.VERCEL_URL}`;
	} else {
		url = 'http://127.0.0.1:5173';
	}

	if (!event && url.includes('localhost')) {
		url = url.replace('localhost', '127.0.0.1');
	}

	return url.endsWith('/') ? url : `${url}/`;
}

/**
 * Base URL for server-to-server self-fetches.
 * Prefers VERCEL_URL so each deployment fetches from itself, not production.
 * - With a request, use the actual request origin.
 * - Otherwise: VERCEL_URL > ORIGIN > localhost default.
 */
export function getSelfURL(event?: RequestEvent): string {
	let url: string;
	if (event) {
		url = event.url.origin;
	} else if (env.VERCEL && env.VERCEL_URL) {
		url = `https://${env.VERCEL_URL}`;
	} else {
		url = env.ORIGIN ?? 'http://127.0.0.1:5173';
	}

	if (!event && url.includes('localhost')) {
		url = url.replace('localhost', '127.0.0.1');
	}

	return url.endsWith('/') ? url : `${url}/`;
}
