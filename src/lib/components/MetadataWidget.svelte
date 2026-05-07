<script module lang="ts">
	// Session-level flag - pulse only once per page load
	let hasSessionPulsed = false;
</script>

<script lang="ts">
	import WizardCore, { type WizardCoreState } from '$lib/components/wizard/WizardCore.svelte';
	import { isReservedFieldKey, schemaHasRenderableFormFields } from '$lib/utils/schema-utils';
	import CardTypeSelector from './CardTypeSelector.svelte';
	import { onMount } from 'svelte';
	import type { EditorStateStore, EditorTarget } from '$lib/editor/editorState.svelte';
	import { getQuillmarkContext } from '$lib/context.js';
	import type { FormSchema } from '$lib/types.js';

	const bindings = getQuillmarkContext();

	interface Props {
		/** Form-projection schema slice from `quill.form(doc).{main|cards[i]}.schema`. */
		schema: FormSchema | null;
		/** Resolved quill ref — needed to re-project on type changes for defaults extraction. */
		quillRef: string | null;
		/** Card-type tags this quill accepts (`info.cardTypes`). */
		cardTypes?: readonly string[];
		/** Context determines repair UI vs frontmatter UI. */
		context?: 'frontmatter' | 'card';
		/** Optional title override. */
		title?: string;
		/** Callback when content changes (bubbled from WizardCore writes). */
		onChange: () => void;
		/** External data for cross-block showWhen conditions (frontmatter when in card context). */
		parentData?: Record<string, unknown>;
		/** AST mutation target — passed through to WizardCore. */
		target: EditorTarget;
		/** EditorStateStore — passed through to WizardCore. */
		store: EditorStateStore;
	}

	let {
		schema,
		quillRef,
		cardTypes = [],
		context = 'frontmatter',
		title,
		onChange,
		parentData,
		target,
		store
	}: Props = $props();

	let wizardState = $state<WizardCoreState | undefined>(undefined);

	/** Live frontmatter values for showWhen conditions. */
	const parsedMetadata = $derived.by<Record<string, unknown>>(() => {
		if (target.kind === 'main') {
			return store.mainFrontmatter;
		}
		return (store.getCard(target.index)?.frontmatter as Record<string, unknown>) ?? {};
	});

	const schemaHasMetadataFields = $derived(
		!!schema &&
			schemaHasRenderableFormFields(
				schema as unknown as Record<string, unknown>,
				parsedMetadata,
				parentData
			)
	);

	const currentCardType = $derived.by<string | null>(() => {
		if (target.kind !== 'card') return null;
		return store.getCard(target.index)?.tag ?? null;
	});

	/**
	 * Re-tag a card (used by the "Invalid Card Type" repair UI when a doc
	 * loads with a tag the current quill no longer defines). Sets the new
	 * tag structurally and merges in any schema defaults missing from the
	 * existing frontmatter, so the user lands in an editable state.
	 */
	function handleCardTypeRepair(newType: string) {
		if (target.kind !== 'card' || !quillRef) return;

		store.setCardTag(target.index, newType);

		try {
			const cardSchema = bindings.getQuill(quillRef).schema.card_types?.[newType];
			if (cardSchema?.fields) {
				const existingData =
					(store.getCard(target.index)?.frontmatter as Record<string, unknown>) ?? {};
				const defaults: Record<string, unknown> = {};
				for (const [name, field] of Object.entries(cardSchema.fields)) {
					if (isReservedFieldKey(name)) continue;
					if (field.default !== undefined && !(name in existingData)) {
						defaults[name] = field.default;
					}
				}
				if (Object.keys(defaults).length > 0) {
					store.setCardFields(target.index, defaults);
				}
			}
		} catch (err) {
			console.warn('[MetadataWidget] Failed to read card defaults:', err);
		}

		onChange();
	}

	// Pulse animation on mount to draw attention to metadata fields
	let showPulse = $state(false);

	const widgetClass = $derived(
		`metadata-widget-base divider-border-t divider-border-b border-divider-accent transition-colors ${
			showPulse ? 'animate-metadata-widget-pulse' : ''
		}`
	);

	onMount(() => {
		if (hasSessionPulsed || context !== 'frontmatter') return;
		hasSessionPulsed = true;

		const startTimer = setTimeout(() => {
			showPulse = true;
			setTimeout(() => {
				showPulse = false;
			}, 1200);
		}, 300);

		return () => clearTimeout(startTimer);
	});
</script>

<!-- Unified metadata widget for frontmatter and cards -->
<!-- We intentionally distinguish "missing schema" from "schema with zero properties":
     - missing schema keeps repair/fallback UI
     - zero properties means hide metadata widget entirely -->
{#if schemaHasMetadataFields}
	<div class={widgetClass}>
		<WizardCore
			{schema}
			onDocumentChange={onChange}
			bind:coreState={wizardState}
			sectionTitle={title}
			{parentData}
			{target}
			{store}
		/>
	</div>
{:else if !schema}
	<div class={widgetClass}>
		{#if context === 'card'}
			{@const currentType = currentCardType}
			{#if currentType && cardTypes.length > 0 && !cardTypes.includes(currentType)}
				<!-- Invalid Card Type (Repair Mode) — loaded a doc whose card tag
				     isn't in this quill's card_types. -->
				<div class="flex flex-col gap-2 px-4 py-3 bg-destructive/10">
					<div class="text-sm font-medium text-destructive">
						Invalid card type: <span class="font-mono">{currentType}</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="text-sm text-muted-foreground whitespace-nowrap">Change to:</span>
						<div class="w-64">
							<CardTypeSelector
								value={null}
								items={[...cardTypes]}
								onSelect={handleCardTypeRepair}
							/>
						</div>
					</div>
				</div>
			{:else}
				<!-- Valid tag but no schema for it (malformed or missing card_types entry). -->
				<div class="px-4 py-3 text-sm text-muted-foreground">
					No schema available for {title || currentType}.
				</div>
			{/if}
		{:else}
			<div class="px-4 py-3 text-sm text-destructive">
				No schema available{title ? ` for ${title}` : ''}.
			</div>
		{/if}
	</div>
{/if}
