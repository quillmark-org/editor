/**
 * Schema utility for the editor's wizard form.
 *
 * Card-type enumeration and per-card schemas are no longer derived here —
 * those come from `quillmarkService.getQuillInfo(ref).cardTypes` and from
 * `quill.form(doc)` respectively.
 */

import { isReservedFieldKey } from '$lib/utils/schema-utils';

/**
 * Get default values from a form-projection schema as a plain object.
 * Reads `const` first, then `default`. Falls back to `{}` for required
 * `type: object` fields so structure validation passes.
 */
export function getSchemaDefaults(
	schema: { fields?: Record<string, unknown> } | null | undefined
): Record<string, unknown> {
	if (!schema || typeof schema !== 'object' || !schema.fields) {
		return {};
	}

	const fields = schema.fields as Record<string, Record<string, unknown>>;
	const defaults: Record<string, unknown> = {};

	for (const [key, prop] of Object.entries(fields)) {
		if (isReservedFieldKey(key)) continue;
		if (typeof prop !== 'object' || !prop) continue;

		if ('const' in prop) {
			defaults[key] = prop.const;
			continue;
		}

		if ('default' in prop) {
			defaults[key] = prop.default;
			continue;
		}

		const isRequired = prop.required === true;
		if (isRequired && prop.type === 'object') {
			defaults[key] = {};
		}
	}

	return defaults;
}
