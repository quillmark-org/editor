/**
 * Drizzle Error Mapping
 * Maps PostgreSQL error codes to application-level errors
 */

import { createErrorClass, AppError } from '$lib/errors';

/**
 * Database-specific error class
 */
export type DatabaseErrorCode =
	| 'duplicate'
	| 'not_found'
	| 'validation_failed'
	| 'foreign_key_violation'
	| 'unknown_error';

export const DatabaseError = createErrorClass<DatabaseErrorCode>('DatabaseError', 500);

/**
 * PostgreSQL error code mappings
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const POSTGRES_ERROR_MAP: Record<
	string,
	{ code: DatabaseErrorCode; message: string; status: number }
> = {
	// Class 23 - Integrity Constraint Violation
	'23505': { code: 'duplicate', message: 'Duplicate entry', status: 400 },
	'23503': { code: 'foreign_key_violation', message: 'Referenced resource not found', status: 404 },
	'23514': { code: 'validation_failed', message: 'Validation constraint failed', status: 400 },
	'23502': { code: 'validation_failed', message: 'Required field is missing', status: 400 }
};

/**
 * Check if an error is a Postgres error with a code
 */
function isPostgresError(error: unknown): error is { code: string; message?: string } {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		typeof (error as { code: unknown }).code === 'string'
	);
}

/**
 * Map a Drizzle/Postgres error to an application error
 *
 * @param error - The error from Drizzle ORM or pg driver
 * @param defaultCode - Default error code if not recognized
 * @param defaultStatus - Default HTTP status code
 * @returns AppError instance
 *
 * The returned `AppError.message` is rendered in the HTTP response body by
 * `handleServiceError`. Driver-supplied messages can leak schema, query
 * fragments, or constraint names, so unmapped errors are wrapped with a
 * generic message; the raw error is logged here for operator diagnostics.
 */
export function mapDrizzleError(
	error: unknown,
	defaultCode: DatabaseErrorCode = 'unknown_error',
	defaultStatus = 500
): AppError {
	// Handle Postgres errors with error codes
	if (isPostgresError(error)) {
		const mapping = POSTGRES_ERROR_MAP[error.code];
		if (mapping) {
			return new DatabaseError(mapping.code, mapping.message, mapping.status);
		}
	}

	// Extract a message for pattern matching and logging (not for the response).
	const message =
		error instanceof Error
			? error.message
			: typeof error === 'object' && error !== null && 'message' in error
				? String((error as { message: unknown }).message)
				: 'Database error';

	// Check for common error patterns in message
	if (message.includes('duplicate') || message.includes('unique')) {
		return new DatabaseError('duplicate', 'Duplicate entry', 400);
	}

	if (message.includes('not found') || message.includes('no rows')) {
		return new DatabaseError('not_found', 'Resource not found', 404);
	}

	if (message.includes('violates check constraint')) {
		return new DatabaseError('validation_failed', 'Validation failed', 400);
	}

	// Unmapped: log raw details server-side, return generic message to caller.
	console.error('[db] Unmapped database error:', error);
	return new DatabaseError(defaultCode, 'Database error', defaultStatus);
}
