/**
 * Schema-related utilities for consistent handling of schema properties.
 */

/** True for QUILL, CARD, and any other all-caps sentinel keys the wasm engine injects. */
export function isReservedFieldKey(key: string): boolean {
	return key !== key.toLowerCase();
}

/**
 * Normalize a group name to handle common misspellings.
 * This ensures consistent grouping across all wizard/form components.
 */
export function normalizeGroupName(name: string): string {
	if (name === 'Stationary') return 'Stationery';
	return name;
}

/**
 * Check if a field's ui.showWhen condition is satisfied.
 * Mirrors SchemaForm — used so "empty form" detection matches actual rendering.
 */
export function isFieldVisibleForSchemaForm(
	prop: Record<string, unknown> | null | undefined,
	localData: Record<string, unknown>,
	externalData?: Record<string, unknown>
): boolean {
	const showWhen = (prop as { ui?: { showWhen?: { field?: string; value?: unknown } } })?.ui
		?.showWhen;
	if (!showWhen) return true;

	const { field, value } = showWhen;
	if (!field) return true;

	const actualValue = localData?.[field] ?? externalData?.[field];

	if (Array.isArray(value)) {
		return value.includes(actualValue);
	}
	return actualValue === value;
}

/**
 * True if the schema would render at least one field in SchemaForm
 * (excludes discriminator / reserved keys like CARD, x-card props, and fields hidden by showWhen).
 */
export function schemaHasRenderableFormFields(
	schema: Record<string, unknown> | null | undefined,
	localData?: Record<string, unknown>,
	parentData?: Record<string, unknown>
): boolean {
	const raw = schema?.fields;
	if (!raw || typeof raw !== 'object') return false;
	const fields = raw as Record<string, unknown>;

	for (const [key, prop] of Object.entries(fields)) {
		if (typeof prop !== 'object' || prop === null) continue;
		if ((prop as { ['x-card']?: unknown })['x-card']) continue;
		if (isReservedFieldKey(key)) continue;
		if (!isFieldVisibleForSchemaForm(prop as Record<string, unknown>, localData ?? {}, parentData))
			continue;
		return true;
	}
	return false;
}
