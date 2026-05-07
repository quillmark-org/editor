import { errorResponse } from '$lib/server/utils/api';

interface ParsePaginationOptions {
	defaultLimit: number;
	maxLimit: number;
	defaultOffset?: number;
}

export function parsePaginationParams(
	searchParams: URLSearchParams,
	options: ParsePaginationOptions
): { limit: number; offset: number } {
	const { defaultLimit, maxLimit, defaultOffset = 0 } = options;

	let limit = parseInt(searchParams.get('limit') ?? String(defaultLimit), 10);
	if (Number.isNaN(limit) || limit < 1) {
		limit = defaultLimit;
	}

	let offset = parseInt(searchParams.get('offset') ?? String(defaultOffset), 10);
	if (Number.isNaN(offset) || offset < 0) {
		offset = defaultOffset;
	}

	return { limit: Math.min(limit, maxLimit), offset };
}

export function requireStringField(
	value: unknown,
	field: string,
	errorMessage: string,
	maxLength?: number
): string | Response {
	if (typeof value !== 'string' || !value.trim()) {
		return errorResponse('validation_error', errorMessage, 400);
	}

	if (maxLength && value.length > maxLength) {
		return errorResponse(
			'validation_error',
			`${field} must be ${maxLength} characters or fewer`,
			400
		);
	}

	return value;
}

export function optionalStringField(
	value: unknown,
	field: string,
	errorMessage: string,
	maxLength?: number
): string | undefined | Response {
	if (value === undefined) {
		return undefined;
	}

	return requireStringField(value, field, errorMessage, maxLength);
}
