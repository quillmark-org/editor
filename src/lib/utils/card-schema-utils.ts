/**
 * Schema utility for the editor's wizard form.
 *
 * Card-kind enumeration and per-card schemas are no longer derived here —
 * those come from `quillmarkService.getQuillInfo(ref).cardTypes` and from
 * `quill.form(doc)` respectively.
 */

import { isReservedFieldKey } from '$lib/utils/schema-utils';

/**
 * Get default values from a form-projection schema as a plain object.
 *
 * wasm 0.83+ schemas describe only user-fillable fields (no synthetic
 * QUILL/CARD discriminator entries, no `const` sentinels), and a field's
 * "Endorsed" vs "Must Fill" cell is determined purely by whether it
 * declares a `default` — there is no `required` axis. So we read `default`
 * and nothing else; "Must Fill" fields are omitted from the defaults map.
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
		if ('default' in prop) {
			defaults[key] = prop.default;
		}
	}

	return defaults;
}
