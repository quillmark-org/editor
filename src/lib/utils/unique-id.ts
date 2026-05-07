/**
 * Generates a unique ID for component use (e.g., form field labels, accessibility attributes)
 *
 * Uses crypto.randomUUID() when available in the browser, falls back to timestamp + random
 *
 * @param prefix - Optional prefix for the ID (e.g., 'field', 'select')
 * @returns A unique ID string
 *
 * @example
 * const id = generateUniqueId('field'); // 'field-abc123def456'
 * const id = generateUniqueId(); // 'abc123def456'
 */
export function generateUniqueId(prefix?: string): string {
	let uniquePart: string;

	// Use crypto.randomUUID() if available, fallback to timestamp + random
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		uniquePart = crypto.randomUUID();
	} else {
		// Fallback: timestamp + random base36 string
		uniquePart = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
	}

	return prefix ? `${prefix}-${uniquePart}` : uniquePart;
}
