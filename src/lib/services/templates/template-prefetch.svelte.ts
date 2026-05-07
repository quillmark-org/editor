/**
 * Recommended template list snapshot.
 *
 * Holds a single reactive snapshot of the recommended library list. The
 * snapshot is populated on the first call to `prefetchTemplateList()` (at app
 * load) and from then on is preserved indefinitely so consumers always have
 * something to render — there is no TTL eviction.
 *
 * Refreshes are driven by:
 *   - `requestTemplateListRefresh()` — throttled to once per 30 s, called on
 *     New Document button hover/focus from the sidebar.
 *   - `invalidateTemplateListCache()` — bypasses the throttle, called after
 *     local mutations (publish/unpublish) so the next fetch reflects the new
 *     state. The previous snapshot stays visible until the refetch resolves,
 *     so consumers never flash an empty/loading state.
 *
 * Subscribers read the snapshot via `getCachedTemplateList()` from inside a
 * `$derived`/`$effect`; the underlying `$state` propagates updates without
 * any explicit notify step.
 */

import { listLibraryTemplates } from './library-client';
import type { LibraryTemplateListResult } from './library-client';
import { browser } from '$app/environment';

const REFRESH_THROTTLE_MS = 30_000;

const EMPTY_RESULT: LibraryTemplateListResult = {
	templates: [],
	total: 0,
	limit: 0,
	offset: 0
};

let cachedResult = $state<LibraryTemplateListResult | null>(null);
let inflight: Promise<LibraryTemplateListResult> | null = null;
let lastRefreshAt = 0;

function startFetch(): Promise<LibraryTemplateListResult> {
	const promise = listLibraryTemplates({ sort: 'recommended', limit: 100 });
	inflight = promise;
	promise.then(
		(result) => {
			cachedResult = result;
			lastRefreshAt = Date.now();
			if (inflight === promise) inflight = null;
		},
		() => {
			if (inflight === promise) inflight = null;
		}
	);
	return promise;
}

/**
 * Get the recommended template list, starting the first fetch if the
 * snapshot is still cold. After the first successful load this resolves
 * synchronously with the cached snapshot — consumers should treat it as a
 * stale-while-revalidate read.
 */
export function prefetchTemplateList(): Promise<LibraryTemplateListResult> {
	if (!browser) return Promise.resolve(EMPTY_RESULT);
	if (cachedResult) return Promise.resolve(cachedResult);
	if (inflight) return inflight;
	return startFetch();
}

/**
 * Trigger a background refresh, throttled to one fetch per
 * REFRESH_THROTTLE_MS. The cached snapshot updates reactively when the fetch
 * resolves; the previous value stays visible until then.
 */
export function requestTemplateListRefresh(): void {
	if (!browser || inflight) return;
	if (Date.now() - lastRefreshAt < REFRESH_THROTTLE_MS) return;
	void startFetch();
}

/**
 * Force an immediate background refresh, bypassing the throttle. Use after
 * local mutations (publish/unpublish). The snapshot keeps showing the old
 * value until the refetch resolves so the UI does not flash a loading state.
 */
export function invalidateTemplateListCache(): void {
	if (!browser || inflight) return;
	void startFetch();
}

/**
 * Reactive snapshot accessor. Returns null until the first fetch resolves.
 * Read from inside a `$derived` or `$effect` to subscribe to updates.
 */
export function getCachedTemplateList(): LibraryTemplateListResult | null {
	return cachedResult;
}

/**
 * Reset all module state. Test-only — production code should use
 * `invalidateTemplateListCache()` for the publish flow.
 */
export function __resetTemplateListCacheForTesting(): void {
	cachedResult = null;
	inflight = null;
	lastRefreshAt = 0;
}
