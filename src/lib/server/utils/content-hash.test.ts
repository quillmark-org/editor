/**
 * Content Hash Utility Tests
 */

import { describe, it, expect } from 'vitest';
import { computeContentHash } from './content-hash';

describe('computeContentHash', () => {
	it('should return a 32-character hex string (MD5)', () => {
		const hash = computeContentHash('hello');
		expect(hash).toHaveLength(32);
		expect(hash).toMatch(/^[0-9a-f]{32}$/);
	});

	it('should be deterministic', () => {
		const a = computeContentHash('test content');
		const b = computeContentHash('test content');
		expect(a).toBe(b);
	});

	it('should produce different hashes for different content', () => {
		const a = computeContentHash('content A');
		const b = computeContentHash('content B');
		expect(a).not.toBe(b);
	});

	it('should handle empty string', () => {
		const hash = computeContentHash('');
		expect(hash).toHaveLength(32);
		// MD5 of empty string is well-known
		expect(hash).toBe('d41d8cd98f00b204e9800998ecf8427e');
	});

	it('should handle unicode content', () => {
		const hash = computeContentHash('日本語テスト 🎉');
		expect(hash).toHaveLength(32);
	});
});
