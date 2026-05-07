<script lang="ts">
	import StringField from './fields/StringField.svelte';
	import NumberField from './fields/NumberField.svelte';
	import BooleanField from './fields/BooleanField.svelte';
	import ArrayField from './fields/ArrayField.svelte';
	import EnumField from './fields/EnumField.svelte';
	import DateField from './fields/DateField.svelte';
	import MarkdownField from './fields/MarkdownField.svelte';
	import CollapsibleSection from '$lib/components/ui/collapsible-section.svelte';
	import { isFieldVisibleForSchemaForm, isReservedFieldKey, normalizeGroupName } from '$lib/utils/schema-utils';
	import type { Component } from 'svelte';
	import type { FormSchema } from '$lib/services/quillmark/types';

	/**
	 * UI-bearing slice of a Quillmark schema field. Captures the keys this
	 * component actually reads; avoids leaking `any` into the form layer.
	 */
	interface FieldProp {
		type?: string;
		default?: unknown;
		enum?: readonly unknown[];
		ui?: {
			group?: string;
			order?: number;
			colSpan?: number;
			compact?: boolean;
			multiline?: boolean;
		};
		'x-card'?: unknown;
	}
	type FormData = Record<string, unknown>;

	interface Props {
		schema: FormSchema | null;
		data: FormData;
		onFieldDirty?: (field: string) => void;
		startCollapsed?: boolean;
		sectionTitle?: string;
		/** External data for cross-block showWhen conditions (e.g., frontmatter data for card fields) */
		parentData?: Record<string, unknown>;
	}

	let { 
		schema, 
		data = $bindable({}), 
		onFieldDirty, 
		startCollapsed = true,
		sectionTitle,
		parentData
	}: Props = $props();

	let expandedGroup = $state<string | null>(null);

	function groupElementId(group: string): string {
		return `group-${group}`;
	}

	function toggleGroup(group: string) {
		if (expandedGroup === group) {
			expandedGroup = null;
		} else {
			expandedGroup = group;
		}
	}


	// Initialize data fields before rendering
	$effect.pre(() => {
		if (schema && schema.fields && data) {
			for (const [key, prop] of Object.entries(schema.fields)) {
				// Skip fields marked with x-card
				if ((prop as FieldProp)['x-card']) continue;

				// Skip reserved fields (fully uppercase)
				if (isReservedFieldKey(key)) continue;

				if (data[key] === undefined) {
					// Only apply explicit schema defaults, not empty type-based defaults
					const p = prop as FieldProp;
					if (p.default !== undefined) {
						data[key] = p.default;
						// Mark as dirty so the document syncs with the default value
						onFieldDirty?.(key);
					}
				}
			}
		}
	});

	// Group fields by ui.group
	let groups = $derived.by(() => {
		const g: Record<string, string[]> = {};
		// Default group - use sectionTitle if provided
		const defaultGroup = sectionTitle || 'Properties';

		if (!schema || !schema.fields) {
			return { [defaultGroup]: [] };
		}

		for (const [key, prop] of Object.entries(schema.fields)) {
			if (typeof prop !== 'object' || prop === null) continue;
			
			// Skip fields marked with x-card
			if ((prop as FieldProp)['x-card']) continue;

			// Skip reserved fields (fully uppercase)
			if (isReservedFieldKey(key)) continue;

			// Skip fields hidden by showWhen conditions
			if (!isFieldVisibleForSchemaForm(prop as unknown as Record<string, unknown>, data, parentData)) continue;
			
			const rawGroupName = (prop as FieldProp).ui?.group || defaultGroup;
			const groupName = normalizeGroupName(rawGroupName);
			if (!g[groupName]) g[groupName] = [];
			g[groupName].push(key);
		}

		// Sort fields within groups by ui.order
		for (const groupName in g) {
			g[groupName].sort((a, b) => {
				const propA = schema!.fields[a] as FieldProp;
				const propB = schema!.fields[b] as FieldProp;
				const orderA = propA.ui?.order ?? Number.MAX_VALUE;
				const orderB = propB.ui?.order ?? Number.MAX_VALUE;
				return orderA - orderB;
			});
		}

		// Sort groups by the lowest order of their fields
		const sortedGroupNames = Object.keys(g).sort((a, b) => {
			const getMinOrder = (groupName: string) => {
				if (!g[groupName].length) return Number.MAX_VALUE;
				const firstField = g[groupName][0];
				const prop = schema!.fields[firstField] as FieldProp;
				return prop.ui?.order ?? Number.MAX_VALUE;
			};
			return getMinOrder(a) - getMinOrder(b);
		});

		const ordered: Record<string, string[]> = {};
		for (const groupName of sortedGroupNames) {
			ordered[groupName] = g[groupName];
		}

		return ordered;
	});

	let groupLayouts = $derived.by(() => {
		const result: Record<string, LayoutSegment[]> = {};
		for (const [group, keys] of Object.entries(groups)) {
			result[group] = buildLayoutSegments(keys, schema!.fields, maxFieldsPerRow);
		}
		return result;
	});

	let groupNames = $derived(Object.keys(groups));

	// Expand the first group on mount
	// Auto-expand when startCollapsed is false, or when there is only one section
	// (a single UI group means there's nothing to collapse between)
	let initialized = false;
	$effect(() => {
		if (!initialized && groupNames.length > 0) {
			if (!startCollapsed || groupNames.length === 1) {
				expandedGroup = groupNames[0];
			}
			initialized = true;
		}
	});

	function humanizeLabel(key: string): string {
		return key
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	type LayoutSegment =
		| { type: 'single'; key: string }
		| { type: 'row'; keys: string[] };

	function buildLayoutSegments(
		keys: string[],
		properties: Record<string, unknown>,
		maxPerRow: number
	): LayoutSegment[] {
		const segments: LayoutSegment[] = [];
		let compactRun: string[] = [];

		function flushRun() {
			for (let i = 0; i < compactRun.length; i += maxPerRow) {
				const chunk = compactRun.slice(i, i + maxPerRow);
				if (chunk.length === 1) {
					segments.push({ type: 'single', key: chunk[0] });
				} else {
					segments.push({ type: 'row', keys: chunk });
				}
			}
			compactRun = [];
		}

		for (const key of keys) {
			const prop = properties[key] as FieldProp | undefined;
			const isCompact = prop?.ui?.compact === true && prop?.type !== 'array';
			if (isCompact) {
				compactRun.push(key);
			} else {
				flushRun();
				segments.push({ type: 'single', key });
			}
		}
		flushRun();

		return segments;
	}

	type FieldComponent = Component<Record<string, unknown>>;
	type FieldKind = 'string' | 'markdown' | 'date' | 'number' | 'boolean' | 'array' | 'enum';
	const FIELD_COMPONENTS: Record<FieldKind, FieldComponent> = {
		string: StringField as unknown as FieldComponent,
		markdown: MarkdownField as unknown as FieldComponent,
		date: DateField as unknown as FieldComponent,
		number: NumberField as unknown as FieldComponent,
		boolean: BooleanField as unknown as FieldComponent,
		array: ArrayField as unknown as FieldComponent,
		enum: EnumField as unknown as FieldComponent
	};
	function getFieldKind(prop: FieldProp): FieldKind {
		if (prop.enum) return 'enum';
		switch (prop.type) {
			case 'markdown':
				return 'markdown';
			case 'date':
				return 'date';
			case 'integer':
			case 'number':
				return 'number';
			case 'boolean':
				return 'boolean';
			case 'array':
				return 'array';
			default:
				return 'string';
		}
	}

	// Minimum comfortable width (px) for a compact field — used to calculate bins per row.
	// At 220px: ≥440px container = 2 cols, ≥660px container = 3 cols.
	const MIN_FIELD_WIDTH = 220;
	let containerWidth = $state(0);
	const maxFieldsPerRow = $derived(
		containerWidth > 0 ? Math.max(1, Math.floor(containerWidth / MIN_FIELD_WIDTH)) : 2
	);

	function gridColsClass(n: number): string {
		return n >= 3 ? 'grid-cols-3' : n === 2 ? 'grid-cols-2' : 'grid-cols-1';
	}

	function colSpanClass(n: number): string {
		const map: Record<number, string> = {
			1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3',
			4: 'col-span-4', 5: 'col-span-5', 6: 'col-span-6'
		};
		return map[n] ?? 'col-span-6';
	}

	function fieldColSpan(key: string): number | undefined {
		return (schema?.fields[key] as FieldProp | undefined)?.ui?.colSpan;
	}

</script>

<div class="schema-form @container flex h-full flex-col" bind:clientWidth={containerWidth}>
	<div class="flex-1 overflow-y-auto">
			{#snippet renderField(key: string)}
				{@const prop = schema!.fields[key] as FieldProp & { description?: string; required?: boolean; ui?: FieldProp['ui'] & { placeholder?: string } }}
				{@const kind = getFieldKind(prop)}
				{@const Component = FIELD_COMPONENTS[kind]}
				<Component
					bind:value={data[key]}
					label={humanizeLabel(key)}
					description={prop.description}
					required={prop.required === true}
					placeholder={prop.ui?.placeholder}
					onDirty={() => onFieldDirty?.(key)}
					{...(kind === 'string' || kind === 'markdown' ? { multiline: prop.ui?.multiline ?? false } : {})}
					{...(prop.enum ? { items: prop.enum } : {})}
				/>
			{/snippet}
			{#each groupNames as group (group)}
				<CollapsibleSection
					id={groupElementId(group)}
					label={group}
					expanded={expandedGroup === group}
					onToggle={() => toggleGroup(group)}
					size="md"
					class="scroll-mt-4"
					buttonClass="gap-1 py-1 pl-1 pr-4"
					contentClass="pl-4 pr-3 pb-1"
				>
					{@const hasColSpan = groups[group].some(key => fieldColSpan(key) !== undefined)}
					{#if hasColSpan}
						<div class="grid grid-cols-6 gap-x-3 gap-y-3">
							{#each groupLayouts[group] as segment, segIdx (segIdx)}
								{#if segment.type === 'single'}
									{@const key = segment.key}
									<div class={colSpanClass(fieldColSpan(key) ?? 6)}>
										{@render renderField(key)}
									</div>
								{:else}
									<div class="col-span-6">
										<div class="grid {gridColsClass(segment.keys.length)} gap-x-3">
											{#each segment.keys as key (key)}
												{@render renderField(key)}
											{/each}
										</div>
									</div>
								{/if}
							{/each}
						</div>
					{:else}
						{#each groupLayouts[group] as segment, segIdx (segIdx)}
							{#if segment.type === 'row'}
								<div class="grid {gridColsClass(segment.keys.length)} gap-x-3">
									{#each segment.keys as key (key)}
										{@render renderField(key)}
									{/each}
								</div>
							{:else}
								{@render renderField(segment.key)}
							{/if}
						{/each}
					{/if}
				</CollapsibleSection>
			{/each}
			{#if groupNames.length === 0}
				<div class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
					<p>No fields found.</p>
					{#if !schema?.fields || Object.keys(schema.fields).length === 0}
						<p class="mt-2 text-xs">Schema has no fields defined.</p>
					{/if}
				</div>
			{/if}
		</div>
</div>
