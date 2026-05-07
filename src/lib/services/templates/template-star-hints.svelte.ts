/**
 * Shared client-side starred template IDs.
 *
 * This is the single source of truth for local starred state used by
 * `NewDocumentModal` and `TemplatePublishModal`.
 */

import { SvelteSet } from 'svelte/reactivity';

const starredTemplateIds = new SvelteSet<string>();

export function addStarredTemplateId(templateId: string) {
	starredTemplateIds.add(templateId);
}

export function removeStarredTemplateId(templateId: string) {
	starredTemplateIds.delete(templateId);
}

export function hasStarredTemplateId(templateId: string): boolean {
	return starredTemplateIds.has(templateId);
}

export function replaceStarredTemplateIds(starredIds: Iterable<string>) {
	starredTemplateIds.clear();
	for (const id of starredIds) {
		starredTemplateIds.add(id);
	}
}
