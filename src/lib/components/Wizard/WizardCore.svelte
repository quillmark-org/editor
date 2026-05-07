<script lang="ts" module>
	export interface WizardCoreState {
		formData: Record<string, unknown>;
		dirtyFields: Set<string>;
		originalData: Record<string, unknown>;
		handleFieldDirty: (field: string) => void;
	}
</script>

<script lang="ts">
	import SchemaForm from './SchemaForm.svelte';
	import { getSchemaDefaults } from '$lib/utils/card-schema-utils';
	import { isReservedFieldKey } from '$lib/utils/schema-utils';
	import type { Snippet } from 'svelte';
	import { quillmarkService } from '$lib/services/quillmark/service';
	import Button from '$lib/components/ui/button.svelte';
	import type { FormSchema, QuillMetadata } from '$lib/services/quillmark/types';
	import type { EditorStateStore, EditorTarget } from '$lib/editor/editorState.svelte';

	/**
	 * WizardCore renders the form for a frontmatter or card target. The
	 * `EditorStateStore` is the single source of truth — `formData` mirrors
	 * the live frontmatter for `target`, dirty fields write back via the
	 * store's setMainField / setCardField mutations.
	 */

	interface Props {
		/** Form-projection schema slice from `quill.form(doc).{main|cards[i]}.schema`. */
		schema: FormSchema | null;
		onDocumentChange?: () => void;
		debounceMs?: number;
		startCollapsed?: boolean;
		coreState?: WizardCoreState;
		children?: Snippet<[WizardCoreState]>;
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
		coreState = $bindable(),
		children,
		sectionTitle,
		parentData,
		target,
		store
	}: Props = $props();

	// Form state
	let formData = $state<Record<string, unknown>>({});
	let originalData = $state<Record<string, unknown>>({});
	let dirtyFields = $state(new Set<string>());

	// Reactive frontmatter snapshot pulled from the store.
	const sourceData = $derived.by<Record<string, unknown>>(() => {
		if (target.kind === 'main') {
			return store.mainFrontmatter;
		}
		return (store.getCard(target.index)?.frontmatter as Record<string, unknown>) ?? {};
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
		originalData = structuredClone(normalizedData);

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

	$effect.pre(() => {
		coreState = {
			formData,
			dirtyFields,
			originalData,
			handleFieldDirty
		};
	});

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

	// Template selection state
	let availableQuills = $state<QuillMetadata[]>([]);
	let isLoadingQuills = $state(false);

	async function loadQuills() {
		try {
			isLoadingQuills = true;
			await quillmarkService.initialize();
			availableQuills = quillmarkService.getAvailableQuills();
		} catch (e) {
			console.error('Failed to load quills', e);
		} finally {
			isLoadingQuills = false;
		}
	}

	function handleTemplateSelect(quillNameValue: string) {
		if (target.kind !== 'main') return;
		store.setQuillRef(quillNameValue);
		onDocumentChange?.();
	}

	$effect(() => {
		if (!schema && !isLoadingQuills && availableQuills.length === 0) {
			loadQuills();
		}
	});

</script>

{#if children}
	{@render children({ formData, dirtyFields, originalData, handleFieldDirty })}
{:else if schema}
	<SchemaForm
		{schema}
		bind:data={formData}
		onFieldDirty={handleFieldDirty}
		{startCollapsed}
		{sectionTitle}
		{parentData}
	/>
{:else}
	<div class="flex h-full flex-col items-center justify-center gap-4 p-8 text-center animate-in fade-in duration-300">
		<div class="space-y-2">
			<h3 class="text-lg font-semibold text-foreground">Select a Template</h3>
			<p class="text-sm text-muted-foreground">
				Choose a template to start editing metadata.
			</p>
		</div>

		{#if isLoadingQuills}
			<div class="text-sm text-muted-foreground">Loading templates...</div>
		{:else if availableQuills.length > 0}
			<div class="grid grid-cols-1 gap-2 w-full max-w-xs">
				{#each availableQuills as quill (quill.name)}
					<Button
						variant="outline"
						class="w-full justify-start text-left"
						onclick={() => handleTemplateSelect(quill.name)}
					>
						<span class="font-medium">{quill.name}</span>
						{#if quill.description}
							<span class="block text-xs text-muted-foreground truncate">{quill.description}</span>
						{/if}
					</Button>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-destructive">
				No templates found. Please check your configuration.
			</p>
		{/if}
	</div>
{/if}
