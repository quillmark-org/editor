import { describe, it, expect } from 'vitest';
import { extractDiagnostics, normalizeDiagnostic } from './diagnostic-utils';

describe('diagnostic-utils', () => {
	describe('normalizeDiagnostic', () => {
		it('normalizes simple diagnostic object with location', () => {
			const raw = { severity: 'Error', message: 'test', location: { line: 1, column: 2 } };
			const d = normalizeDiagnostic(raw);
			expect(d.severity).toBe('error');
			expect(d.message).toBe('test');
			expect(d.location).toEqual({ file: '', line: 1, column: 2 });
		});

		it('extracts location from d.location (alternate key)', () => {
			const raw = { severity: 'Error', message: 'test', location: { line: 1, column: 2 } };
			const d = normalizeDiagnostic(raw);
			expect(d.location).toEqual({ file: '', line: 1, column: 2 });
		});

		it('handles missing location', () => {
			const raw = { severity: 'Error', message: 'test' };
			const d = normalizeDiagnostic(raw);
			expect(d.location).toBeUndefined();
		});

		it('preserves code, hint, and sourceChain', () => {
			const raw = {
				severity: 'Error',
				code: 'validation::coercion_failed',
				message: 'bad date',
				hint: 'use ISO 8601',
				sourceChain: ['main.typ', 'frontmatter']
			};
			const d = normalizeDiagnostic(raw);
			expect(d.code).toBe('validation::coercion_failed');
			expect(d.hint).toBe('use ISO 8601');
			expect(d.sourceChain).toEqual(['main.typ', 'frontmatter']);
		});

		it('normalizes severity', () => {
			expect(normalizeDiagnostic({ severity: 'WARNING', message: '' }).severity).toBe('warning');
			expect(normalizeDiagnostic({ severity: 'Info', message: '' }).severity).toBe('note');
			expect(normalizeDiagnostic({ severity: 'Unknown', message: '' }).severity).toBe('error');
		});
	});

	describe('extractDiagnostics', () => {
		it('extracts from string (simple wrap)', () => {
			const err = 'Failed to parse: Invalid key at line 10 column 5';
			const results = extractDiagnostics(err);
			expect(results).toHaveLength(1);
			expect(results![0].message).toBe(err);
			expect(results![0].location).toBeUndefined();
		});

		it('extracts from wasm Error with rich .diagnostics (the 0.63 shape)', () => {
			const err = Object.assign(new Error('cannot coerce ...'), {
				diagnostics: [
					{
						severity: 'error',
						code: 'validation::coercion_failed',
						message: 'cannot coerce `not-a-real-date` to type `date`',
						hint: 'Ensure all fields can be coerced to their declared types'
					}
				]
			});
			const results = extractDiagnostics(err);
			expect(results).toHaveLength(1);
			expect(results![0].message).toBe('cannot coerce `not-a-real-date` to type `date`');
			expect(results![0].code).toBe('validation::coercion_failed');
			expect(results![0].hint).toBe('Ensure all fields can be coerced to their declared types');
		});

		it('extracts multi-diagnostic Error', () => {
			const err = Object.assign(new Error('Compilation failed with 2 error(s)'), {
				diagnostics: [
					{ severity: 'Error', message: 'first' },
					{ severity: 'Warning', message: 'second' }
				]
			});
			const results = extractDiagnostics(err);
			expect(results).toHaveLength(2);
			expect(results![0].message).toBe('first');
			expect(results![1].message).toBe('second');
		});

		it('extracts from plain object with diagnostics array', () => {
			const err = {
				diagnostics: [
					{ severity: 'Error', message: 'test' },
					{ severity: 'Warning', message: 'test2' }
				]
			};
			const results = extractDiagnostics(err);
			expect(results).toHaveLength(2);
			expect(results![0].message).toBe('test');
			expect(results![1].message).toBe('test2');
		});

		it('extracts from a bare diagnostic-shaped object', () => {
			const err = { severity: 'Error', message: 'test' };
			const results = extractDiagnostics(err);
			expect(results).toHaveLength(1);
			expect(results![0].message).toBe('test');
		});

		it('falls back to Error.message when no diagnostics attached', () => {
			const err = new Error('plain error');
			const results = extractDiagnostics(err);
			expect(results).toHaveLength(1);
			expect(results![0].message).toBe('plain error');
		});

		it('returns null for empty object / null / undefined', () => {
			expect(extractDiagnostics({})).toBeNull();
			expect(extractDiagnostics(null)).toBeNull();
			expect(extractDiagnostics(undefined)).toBeNull();
		});
	});
});
