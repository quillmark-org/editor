/**
 * Quillmark Diagnostic Utilities
 *
 * Pure functions for extracting and normalizing diagnostic information
 * from WASM errors. Shared between client and server code.
 */

import type { QuillmarkDiagnostic, DiagnosticSeverity, DiagnosticLocation } from './types';

/**
 * Normalize severity to lowercase TypeScript type
 */
function normalizeSeverity(severity: unknown): DiagnosticSeverity {
	if (typeof severity === 'string') {
		const lower = severity.toLowerCase();
		if (lower === 'error' || lower === 'warning' || lower === 'note') {
			return lower as DiagnosticSeverity;
		}
		if (lower === 'info') return 'note';
	}
	return 'error'; // Default to error
}

/**
 * Normalize a single diagnostic payload into the typed shape consumers expect.
 * Accepts typed wasm Diagnostic objects as well as synthesised plain objects.
 */
export function normalizeDiagnostic(diagnostic: unknown): QuillmarkDiagnostic {
	const d = (diagnostic ?? {}) as Record<string, unknown>;

	let location: DiagnosticLocation | undefined;
	const loc = d.location as Record<string, unknown> | undefined;
	if (loc) {
		location = {
			file: (loc.file as string) || '',
			line: loc.line as number,
			column: loc.column as number
		};
	}

	return {
		severity: normalizeSeverity(d.severity),
		code: (d.code as string) || undefined,
		message: (d.message as string) || 'Unknown error',
		location,
		hint: (d.hint as string) || undefined,
		sourceChain: (d.sourceChain as string[]) || []
	};
}

/**
 * Extract diagnostic information from a WASM error.
 *
 * Every thrown error is an `Error` instance with a top-level `.diagnostics`
 * array. Also tolerates plain-object payloads and bare strings so non-engine
 * callers can pass synthesised errors.
 *
 * @param error - The error thrown by the WASM engine
 * @returns Array of normalized QuillmarkDiagnostics, or null if none found
 */
export function extractDiagnostics(error: unknown): QuillmarkDiagnostic[] | null {
	if (typeof error === 'string') {
		return [{ severity: 'error', message: error, sourceChain: [] }];
	}

	if (!error || typeof error !== 'object') {
		return null;
	}

	const err = error as { diagnostics?: unknown; severity?: unknown; message?: unknown };

	if (Array.isArray(err.diagnostics) && err.diagnostics.length > 0) {
		return err.diagnostics.map(normalizeDiagnostic);
	}

	if (err.severity && err.message) {
		return [normalizeDiagnostic(err)];
	}

	if (error instanceof Error) {
		return [{ severity: 'error', message: error.message, sourceChain: [] }];
	}

	return null;
}
