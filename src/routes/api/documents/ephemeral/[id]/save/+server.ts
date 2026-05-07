/**
 * POST /api/documents/ephemeral/[id]/save
 *
 * Promote an ephemeral document into the user's library. Owner-only;
 * transactional copy + delete. Returns `{ id }` of the new document.
 *
 * 404 (ambiguous) if the ephemeral does not exist, has expired, or belongs
 * to another user — the same not-found shape used by the public document
 * route, so a non-owner cannot probe for existence.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/utils/auth';
import { validateUUID } from '$lib/server/utils/api';
import { logAmbiguousResponse } from '$lib/server/utils/ambiguous-response-logging';
import { promoteEphemeralDocument } from '$lib/server/services/ephemeral-documents';
import { AppError } from '$lib/errors';
import { getServerConfig } from '$lib/config/load.server';

export const POST: RequestHandler = async (event) => {
	// Gate the entire feature on features.mcp.enabled. The route appears
	// unmounted (404) when the deployment hasn't opted in.
	if (!getServerConfig().features.mcp.enabled) {
		return json({ error: 'not_found' }, { status: 404 });
	}

	let user;
	try {
		user = await requireAuth(event);
	} catch (error) {
		if (error instanceof Response) return error;
		throw error;
	}

	const id = event.params.id;
	const uuidError = validateUUID(id, 'id');
	if (uuidError) return uuidError;

	try {
		const result = await promoteEphemeralDocument({ userId: user.id, id: id! });
		return json(result);
	} catch (error) {
		if (error instanceof AppError && error.code === 'not_found') {
			const correlationId = logAmbiguousResponse(event, {
				route: '/api/documents/ephemeral/[id]/save',
				externalStatus: 404,
				reason: 'ephemeral_not_found_or_not_owner',
				resourceId: id,
				userId: user.id
			});
			return json(
				{ error: 'not_found', message: 'Ephemeral document not found' },
				{ status: 404, headers: { 'x-correlation-id': correlationId } }
			);
		}
		const correlationId = logAmbiguousResponse(event, {
			route: '/api/documents/ephemeral/[id]/save',
			externalStatus: 404,
			reason: 'exception_during_ephemeral_promote',
			error,
			resourceId: id,
			userId: user.id
		});
		return json(
			{ error: 'not_found', message: 'Ephemeral document not found' },
			{ status: 404, headers: { 'x-correlation-id': correlationId } }
		);
	}
};
