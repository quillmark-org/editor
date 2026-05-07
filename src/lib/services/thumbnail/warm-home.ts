/**
 * App-load warm for the NewDocumentModal home page.
 *
 * Fetches the recommended template list, picks the same home set the modal
 * itself renders (officials + popular community + recents), and primes
 * thumbnails for each one through the worker. Subsequent modal opens hit the
 * CacheStorage entry written by `renderThumbnail` and avoid a WASM render.
 *
 * Newly-published community templates that show up only after this warm (e.g.
 * via the sidebar hover refresh) fall back to the modal's existing on-demand
 * thumbnail path.
 */

import { browser } from '$app/environment';
import { THUMBNAIL_CACHE_KEY_PREFIX, THUMBNAIL_CACHE_NAME, renderThumbnail } from './service';
import { prefetchTemplateList } from '../templates/template-prefetch.svelte';
import { getLibraryTemplate, listRecentTemplates } from '../templates/library-client';
import type { LibraryTemplateListItem } from '../templates/library-client';

const HOME_SECTION_MAX_ITEMS = 10;
const HOME_RECENTS_MAX_ITEMS = 5;
const POPULAR_IMPORT_WEIGHT = 0.1;

export async function warmHomeThumbnails(options: { isAuthenticated: boolean }): Promise<void> {
	if (!browser) return;

	let list: Awaited<ReturnType<typeof prefetchTemplateList>>;
	try {
		list = await prefetchTemplateList();
	} catch (error) {
		console.warn('[warmHomeThumbnails] template list fetch failed', error);
		return;
	}

	const officials = list.templates.filter((t) => t.is_official).slice(0, HOME_SECTION_MAX_ITEMS);
	const popular = [...list.templates.filter((t) => !t.is_official)]
		.sort(
			(a, b) =>
				b.star_count +
				POPULAR_IMPORT_WEIGHT * b.import_count -
				(a.star_count + POPULAR_IMPORT_WEIGHT * a.import_count)
		)
		.slice(0, HOME_SECTION_MAX_ITEMS);

	const recents: LibraryTemplateListItem[] = options.isAuthenticated
		? await listRecentTemplates({ limit: HOME_RECENTS_MAX_ITEMS })
				.then((r) => r.templates)
				.catch(() => [])
		: [];

	const homeSet = [...recents, ...officials, ...popular];
	const seen = new Set<string>();
	for (const template of homeSet) {
		if (seen.has(template.id)) continue;
		seen.add(template.id);
		try {
			await warmOne(template);
		} catch (error) {
			console.warn('[warmHomeThumbnails] failed for template', template.id, error);
		}
	}
}

async function warmOne(template: LibraryTemplateListItem): Promise<void> {
	const hash = template.content_hash ?? template.id;
	const cache = await caches.open(THUMBNAIL_CACHE_NAME);
	const cached = await cache.match(`${THUMBNAIL_CACHE_KEY_PREFIX}${hash}`);
	if (cached) return;

	const detail = await getLibraryTemplate(template.id);
	const detailHash = detail.content_hash ?? detail.id;
	await renderThumbnail(detail.content, detailHash);
}
