<script lang="ts">
	import SchemaForm from './SchemaForm.svelte';
	import { getSchemaDefaults } from '$lib/utils/card-schema-utils';
	import { isReservedFieldKey } from '$lib/utils/schema-utils';
	import { getCardFields } from '$lib/editor/editorState.svelte';
	import type { FormSchema } from '$lib/types.js';
	import type { EditorStateStore, EditorTarget } from '$lib/editor/editorState.svelte';

	/**
	 * WizardCore renders the form for a main-card or card target. The
	 * `EditorStateStore` is the single source of truth — `formData` mirrors
	 * the live field values for `target`, dirty fields write back via the
	 * store's setMainField / setCardField mutations.
	 */

	interface Props {
		/** Form-projection schema slice from `quill.form(doc).{main|cards[i]}.schema`. */
		schema: FormSchema | null;
		onDocumentChange?: () => void;
		debounceMs?: number;
		startCollapsed?: boolean;
		sectionTitle?: string;
		parentData?: Record<string, unknown>;
		target: EditorTarget;
		store: EditorStateStore;
	}

	let {
		schema,
		onDocumentChange,
		debounceMs = 50,
		startCollapsed = true,
		sectionTitle,
		parentData,
		target,
		store
	}: Props = $props();

	// Form state
	let formData = $state<Record<string, unknown>>({});
	let dirtyFields = $state(new Set<string>());

	// Reactive field-values snapshot pulled from the store.
	const sourceData = $derived.by<Record<string, unknown>>(() => {
		if (target.kind === 'main') {
			return store.mainFrontmatter;
		}
		return getCardFields(store.getCard(target.index));
	});

	// Track the data signature we last initialised from so we don't clobber
	// in-progress edits when the store mutates from our own writes.
	let lastInitSignature = '';

	$effect.pre(() => {
		const data = sourceData;
		const signature = JSON.stringify(data);
		if (signature !== lastInitSignature) {
			lastInitSignature = signature;
			initializeFromData(data);
		}
	});

	function initializeFromData(data: Record<string, unknown>) {
		const normalizedData: Record<string, unknown> = { ...data };
		if (schema && schema.fields) {
			for (const [key, prop] of Object.entries(schema.fields)) {
				if (isReservedFieldKey(key)) continue;
				const p = prop as { type?: string };
				if (p.type === 'array' && typeof normalizedData[key] === 'string') {
					normalizedData[key] = [normalizedData[key]];
				}
			}
		}

		formData = structuredClone(normalizedData);

		if (schema) {
			const defaults = getSchemaDefaults(schema);
			for (const [key, value] of Object.entries(defaults)) {
				if (formData[key] === undefined) {
					formData[key] = value;
				}
			}
		}

		dirtyFields = new Set();
	}

	function handleFieldDirty(field: string) {
		dirtyFields = new Set([...dirtyFields, field]);
	}

	// Debounced effect to flush dirty fields back into the store
	let changeTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const currentFormData = formData;
		const currentDirtyFields = dirtyFields;

		if (currentDirtyFields.size === 0) return;

		clearTimeout(changeTimer);

		changeTimer = setTimeout(() => {
			for (const field of currentDirtyFields) {
				const fieldType = schema?.fields?.[field]?.type as string | undefined;
				if (target.kind === 'card') {
					store.setCardField(target.index, field, currentFormData[field], fieldType);
				} else {
					store.setMainField(field, currentFormData[field], fieldType);
				}
			}
			// Update signature so $effect.pre doesn't reinit from our own writes.
			lastInitSignature = JSON.stringify(sourceData);
			dirtyFields = new Set();
			onDocumentChange?.();
		}, debounceMs);

		return () => {
			clearTimeout(changeTimer);
			changeTimer = undefined;
		};
	});
</script>

{#if schema}
	<SchemaForm
		{schema}
		bind:data={formData}
		onFieldDirty={handleFieldDirty}
		{startCollapsed}
		{sectionTitle}
		{parentData}
	/>
{:else}
	<div class="qm-wizard-empty">
		<h3>No template selected</h3>
		<p>Set a <code>QUILL</code> directive on the document to begin editing metadata.</p>
	</div>
{/if}

<style>
	.qm-wizard-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 2rem;
		text-align: center;
		color: var(--qm-muted-foreground);
	}
	.qm-wizard-empty h3 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--qm-foreground);
	}
	.qm-wizard-empty p {
		margin: 0;
		font-size: 0.875rem;
	}
	.qm-wizard-empty code {
		font-family: var(--qm-font-mono);
		background: var(--qm-muted);
		padding: 0.1rem 0.3rem;
		border-radius: var(--qm-radius-sm);
	}
</style>
