/**
 * Shared naming utilities for all document creation paths.
 *
 * A single scheme is used everywhere:
 *   - "My Doc"       → try bare name first
 *   - "My Doc (2)"   → first numbered variant (never "(1)")
 *   - "My Doc (3)"   → and so on
 *
 * Existing "(N)" suffixes are stripped before generating so that duplicating
 * "My Doc (2)" yields "My Doc (3)" — not "My Doc (2) (2)".
 */

export const DEFAULT_DOCUMENT_NAME = 'Untitled Document';

const COUNTER_SUFFIX_REGEX = / \(\d+\)$/;

/**
 * Strip a trailing "(N)" counter suffix to obtain the root name.
 *
 * "My Doc"       → "My Doc"
 * "My Doc (2)"   → "My Doc"
 * "My Doc (10)"  → "My Doc"
 */
export function stripCounterSuffix(name: string): string {
	return name.replace(COUNTER_SUFFIX_REGEX, '');
}

/**
 * Return a name that does not collide with any entry in `existingNames`.
 *
 * 1. Strip any trailing "(N)" suffix to get the root name.
 * 2. Return the root name itself if it is free.
 * 3. Otherwise find the highest existing "(N)" counter and return root + "(N+1)".
 *    The first numbered variant is always "(2)" — "(1)" is never produced.
 *
 * Examples (no prior collisions):
 *   "My Doc"      → "My Doc"
 *   "My Doc (2)"  → "My Doc"        (stripped; bare name is free)
 *
 * Examples (collisions):
 *   "My Doc"      when "My Doc" exists               → "My Doc (2)"
 *   "My Doc"      when "My Doc", "My Doc (2)" exist  → "My Doc (3)"
 *   "My Doc (2)"  when "My Doc", "My Doc (2)" exist  → "My Doc (3)"
 */
export function generateUniqueName(name: string, existingNames: string[]): string {
	const rootName = stripCounterSuffix(name);

	if (!existingNames.includes(rootName)) {
		return rootName;
	}

	const escaped = rootName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const counterRegex = new RegExp(`^${escaped} \\((\\d+)\\)$`);

	// Start at 1 so the first candidate produced is (2)
	let highest = 1;
	for (const existing of existingNames) {
		const match = existing.match(counterRegex);
		if (match) {
			const n = parseInt(match[1], 10);
			if (n > highest) highest = n;
		}
	}

	return `${rootName} (${highest + 1})`;
}
