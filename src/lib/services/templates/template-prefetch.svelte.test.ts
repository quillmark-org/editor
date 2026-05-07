import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	__resetTemplateListCacheForTesting,
	getCachedTemplateList,
	invalidateTemplateListCache,
	prefetchTemplateList,
	requestTemplateListRefresh
} from './template-prefetch.svelte';
import { listLibraryTemplates } from './library-client';
import type { LibraryTemplateListResult } from './library-client';

vi.mock('$app/environment', () => ({
	browser: true,
	building: false,
	dev: true,
	version: ''
}));

vi.mock('./library-client', () => ({
	listLibraryTemplates: vi.fn()
}));

function makeResult(overrides: Partial<LibraryTemplateListResult> = {}): LibraryTemplateListResult {
	return { templates: [], total: 0, limit: 100, offset: 0, ...overrides };
}

describe('template-prefetch', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		__resetTemplateListCacheForTesting();
	});

	it('deduplicates the initial in-flight request', async () => {
		vi.mocked(listLibraryTemplates).mockResolvedValue(makeResult());

		const first = prefetchTemplateList();
		const second = prefetchTemplateList();

		expect(first).toBe(second);
		expect(listLibraryTemplates).toHaveBeenCalledTimes(1);

		await first;
	});

	it('returns the cached snapshot indefinitely after first load', async () => {
		const result = makeResult({ total: 1 });
		vi.mocked(listLibraryTemplates).mockResolvedValue(result);

		await prefetchTemplateList();
		expect(getCachedTemplateList()).toEqual(result);

		// Long beyond the previous 30 s TTL: snapshot is preserved.
		vi.advanceTimersByTime(60 * 60_000);
		expect(getCachedTemplateList()).toEqual(result);
		expect(listLibraryTemplates).toHaveBeenCalledTimes(1);
	});

	it('throttles requestTemplateListRefresh to once per 30 s', async () => {
		vi.mocked(listLibraryTemplates).mockResolvedValue(makeResult());

		await prefetchTemplateList();
		expect(listLibraryTemplates).toHaveBeenCalledTimes(1);

		// Within the throttle window — no refetch.
		vi.advanceTimersByTime(15_000);
		requestTemplateListRefresh();
		expect(listLibraryTemplates).toHaveBeenCalledTimes(1);

		// Past the window — refetch fires.
		vi.advanceTimersByTime(20_000);
		requestTemplateListRefresh();
		expect(listLibraryTemplates).toHaveBeenCalledTimes(2);
	});

	it('invalidateTemplateListCache bypasses the throttle without clearing the snapshot', async () => {
		const first = makeResult({ total: 1 });
		const second = makeResult({ total: 2 });
		vi.mocked(listLibraryTemplates).mockResolvedValueOnce(first).mockResolvedValueOnce(second);

		await prefetchTemplateList();
		expect(getCachedTemplateList()).toEqual(first);

		invalidateTemplateListCache();
		// Snapshot stays visible while the refetch is in flight.
		expect(getCachedTemplateList()).toEqual(first);
		expect(listLibraryTemplates).toHaveBeenCalledTimes(2);

		// Flush microtasks so the in-flight promise's handler swaps the snapshot.
		await Promise.resolve();
		await Promise.resolve();
		expect(getCachedTemplateList()).toEqual(second);
	});

	it('drops a failed in-flight request so the next call retries', async () => {
		vi.mocked(listLibraryTemplates)
			.mockRejectedValueOnce(new Error('network'))
			.mockResolvedValueOnce(makeResult({ total: 1 }));

		await expect(prefetchTemplateList()).rejects.toThrow('network');

		// No cached snapshot from the failure.
		expect(getCachedTemplateList()).toBeNull();

		await prefetchTemplateList();
		expect(getCachedTemplateList()).toEqual(makeResult({ total: 1 }));
		expect(listLibraryTemplates).toHaveBeenCalledTimes(2);
	});
});
