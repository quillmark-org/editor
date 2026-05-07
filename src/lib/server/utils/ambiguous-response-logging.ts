import type { RequestEvent } from '@sveltejs/kit';

type AmbiguousResponseLogContext = {
	route: string;
	externalStatus: 204 | 404;
	reason: string;
	error?: unknown;
	resourceId?: string;
	userId?: string;
};

function getMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	return 'non_error_throwable';
}

/**
 * Emits structured diagnostics while preserving intentionally ambiguous
 * externally visible responses (e.g. 404 or 204).
 */
export function logAmbiguousResponse(
	event: RequestEvent,
	context: AmbiguousResponseLogContext
): string {
	const rawCorrelationId = event.request.headers.get('x-correlation-id');
	const correlationId =
		rawCorrelationId && /^[A-Za-z0-9-]{1,64}$/.test(rawCorrelationId)
			? rawCorrelationId
			: crypto.randomUUID();
	const payload = {
		level: 'error',
		event: 'ambiguous_api_response',
		correlation_id: correlationId,
		method: event.request.method,
		path: event.url.pathname,
		route: context.route,
		external_status: context.externalStatus,
		reason: context.reason,
		resource_id: context.resourceId ?? null,
		user_id: context.userId ?? null,
		error_message: getMessage(context.error),
		timestamp: new Date().toISOString()
	};

	console.error(JSON.stringify(payload));

	return correlationId;
}
