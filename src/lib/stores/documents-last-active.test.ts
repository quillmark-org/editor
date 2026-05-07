/**
 * Tests for the SimpleState localStorage persistence mechanism
 * used by the last-active-document feature in DocumentStore.
 *
 * Validates that:
 * - SimpleState returns initialValue when nothing is persisted
 * - Setting a value persists it to localStorage
 * - Constructing a new SimpleState restores the persisted value
 * - Invalid JSON in localStorage falls back to initialValue gracefully
 * - Values can be overwritten and null is handled correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LAST_ACTIVE_DOC_KEY } from './documents.svelte';
import { SimpleState } from './factories.svelte';

// ============================================================================
// localStorage mock
// ============================================================================

let storage: Record<string, string> = {};

beforeEach(() => {
	storage = {};

	// SimpleState checks `typeof window === 'undefined'` for SSR safety,
	// so we must stub window in the Node test environment.
	if (typeof globalThis.window === 'undefined') {
		vi.stubGlobal('window', globalThis);
	}

	vi.stubGlobal('localStorage', {
		getItem: (key: string) => storage[key] ?? null,
		setItem: (key: string, value: string) => {
			storage[key] = value;
		},
		removeItem: (key: string) => {
			delete storage[key];
		}
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

// ============================================================================
// Tests
// ============================================================================

describe('LAST_ACTIVE_DOC_KEY constant', () => {
	it('should be a non-empty string', () => {
		expect(LAST_ACTIVE_DOC_KEY).toBe('tonguetoquill_last_active_document');
	});
});

describe('SimpleState persistence for last active document', () => {
	it('should return null when no value is persisted', () => {
		const state = new SimpleState<string | null>({
			initialValue: null,
			persistKey: LAST_ACTIVE_DOC_KEY
		});
		expect(state.value).toBeNull();
	});

	it('should persist a document ID to localStorage', () => {
		const state = new SimpleState<string | null>({
			initialValue: null,
			persistKey: LAST_ACTIVE_DOC_KEY
		});

		state.set('doc-123');
		expect(state.value).toBe('doc-123');
		expect(storage[LAST_ACTIVE_DOC_KEY]).toBe(JSON.stringify('doc-123'));
	});

	it('should restore a persisted document ID on construction', () => {
		// Pre-seed localStorage
		storage[LAST_ACTIVE_DOC_KEY] = JSON.stringify('doc-456');

		const state = new SimpleState<string | null>({
			initialValue: null,
			persistKey: LAST_ACTIVE_DOC_KEY
		});

		expect(state.value).toBe('doc-456');
	});

	it('should fall back to initialValue when localStorage has invalid JSON', () => {
		storage[LAST_ACTIVE_DOC_KEY] = '{invalid-json';

		const state = new SimpleState<string | null>({
			initialValue: null,
			persistKey: LAST_ACTIVE_DOC_KEY
		});

		expect(state.value).toBeNull();
	});

	it('should overwrite previous persisted value', () => {
		storage[LAST_ACTIVE_DOC_KEY] = JSON.stringify('doc-old');

		const state = new SimpleState<string | null>({
			initialValue: null,
			persistKey: LAST_ACTIVE_DOC_KEY
		});

		expect(state.value).toBe('doc-old');

		state.set('doc-new');
		expect(state.value).toBe('doc-new');
		expect(storage[LAST_ACTIVE_DOC_KEY]).toBe(JSON.stringify('doc-new'));
	});

	it('should persist null as a valid value', () => {
		storage[LAST_ACTIVE_DOC_KEY] = JSON.stringify('doc-123');

		const state = new SimpleState<string | null>({
			initialValue: null,
			persistKey: LAST_ACTIVE_DOC_KEY
		});

		state.set(null);
		expect(state.value).toBeNull();
		expect(storage[LAST_ACTIVE_DOC_KEY]).toBe(JSON.stringify(null));
	});
});
