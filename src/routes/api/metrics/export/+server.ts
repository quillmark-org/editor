/**
 * POST /api/metrics/export - Record a document export
 * Fire-and-forget from the client after a successful download.
 * Returns 204 immediately; the metric write is non-blocking.
 *
 * Rate limited: 10 requests per user per 60-second fixed window (shared DB-backed).
 *
 * Body (optional JSON): { document_id?: string }
 */

import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/utils/auth';
import { allowExportRequest, recordExport } from '$lib/server/services/metrics';
import { isValidUUID } from '$lib/server/utils/api';
import { logAmbiguousResponse } from '$lib/server/utils/ambiguous-response-logging';

export const POST: RequestHandler = async (event) => {
	try {
		const user = await requireAuth(event);
		const allowed = await allowExportRequest(user.id);
		if (!allowed) {
			return new Response(null, { status: 429 });
		}

		let documentId: string | null = null;
		try {
			const body = await event.request.json();
			if (
				body !== null &&
				typeof body === 'object' &&
				typeof body.document_id === 'string' &&
				isValidUUID(body.document_id)
			) {
				documentId = body.document_id;
			}
		} catch {
			// Body is optional; ignore parse failures and proceed without a document ID
		}

		recordExport(user.id, documentId);

		return new Response(null, { status: 204 });
	} catch (error) {
		// requireAuth throws a Response on failure
		if (error instanceof Response) return error;
		const correlationId = logAmbiguousResponse(event, {
			route: '/api/metrics/export',
			externalStatus: 204,
			reason: 'exception_during_metrics_export_record',
			error
		});
		return new Response(null, { status: 204, headers: { 'x-correlation-id': correlationId } });
	}
};
