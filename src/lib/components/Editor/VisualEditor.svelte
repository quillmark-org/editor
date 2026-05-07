<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { X } from 'lucide-svelte';

	import { EditorStateStore, type CardView } from '$lib/editor/editorState.svelte';
	import { quillmarkService } from '$lib/services/quillmark/service';
	import type { FormSchema } from '$lib/services/quillmark/types';
	import { getRandomMessage } from '$lib/services/message-generator';

	import MetadataWidget from './MetadataWidget.svelte';
	import EditorBlock from './EditorBlock.svelte';
	import BodyEditor from './BodyEditor.svelte';
	import AddCardTrigger from './AddCardTrigger.svelte';
	import CardTypeSelector from './CardTypeSelector.svelte';

	function formatCardLabel(cardType: string): string {
		if (!cardType) return 'New Card';
		const cleanType = cardType.replace(/_card$/, '');
		return cleanType
			.split('_')
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ');
	}

	function getCardName(card: CardView): string {
		const presentation = card.frontmatter?.PRESENTATION as Record<string, unknown> | undefined;
		if (presentation?.name && typeof presentation.name === 'string') {
			return presentation.name;
		}
		return formatCardLabel(card.tag);
	}

	function handleCardNameChange(index: number, newName: string) {
		const card = editorStore.getCard(index);
		const presentation = (card?.frontmatter?.PRESENTATION as Record<string, unknown>) ?? {};
		editorStore.setCardField(index, 'PRESENTATION', { ...presentation, name: newName });
		emitDocumentChange();
	}

	interface Props {
		document: string;
		/** Resolved canonical quill ref (`name@x.y.z`). Null when no quill bound yet. */
		quillRef: string | null;
		/** Card-type tags accepted by this quill (`info.cardTypes`). */
		cardTypes?: readonly string[];
		onDocumentChange: (doc: string) => void;
		onModeSwitch?: () => void;
		/** Active card position (0-indexed) — owned by parent to survive remounts. `'main'` = primary doc. */
		activeCardId?: number | 'main' | null;
		onActiveCardIdChange?: (id: number | 'main' | null) => void;
	}

	let {
		document: documentContent,
		quillRef,
		cardTypes = [],
		onDocumentChange,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		onModeSwitch,
		activeCardId = null,
		onActiveCardIdChange
	}: Props = $props();

	function setActiveCardId(id: number | 'main' | null) {
		onActiveCardIdChange?.(id);
	}

	const editorStore = new EditorStateStore();
	onDestroy(() => editorStore.destroy());

	let primaryBodyEditor: BodyEditor | undefined = $state();
	let cardEditors: Record<number, BodyEditor> = $state({});
	let pendingScrollCardIndex: number | null = $state(null);
	let pendingKeepInViewCardIndex: number | null = $state(null);

	/**
	 * Index where a UI-only "pick a card type" placeholder is currently
	 * displayed, or `null` when no placeholder is open. The placeholder is
	 * client-side only — it lets the user pick a tag before we materialise
	 * the card in the wasm `Document`, and is dropped on remount, document
	 * re-init, or any structural mutation that would invalidate the index.
	 */
	let placeholderInsertAt: number | null = $state(null);

	function cardScrollAction(
		node: HTMLElement,
		params: { scrollNew: boolean; keepInView: boolean }
	) {
		if (params.scrollNew) {
			node.scrollIntoView({ behavior: 'smooth', block: 'center' });
			pendingScrollCardIndex = null;
		} else if (params.keepInView) {
			node.scrollIntoView({ behavior: 'instant', block: 'nearest' });
			pendingKeepInViewCardIndex = null;
		}
		return {
			update(newParams: { scrollNew: boolean; keepInView: boolean }) {
				if (newParams.scrollNew) {
					node.scrollIntoView({ behavior: 'smooth', block: 'center' });
					pendingScrollCardIndex = null;
				} else if (newParams.keepInView) {
					node.scrollIntoView({ behavior: 'instant', block: 'nearest' });
					pendingKeepInViewCardIndex = null;
				}
			}
		};
	}

	let cards = $derived(editorStore.cards);
	let mainBody = $derived(editorStore.mainBody);

	let lastEmittedDocument: string | null = null;

	let bannerDismissed = $state(false);
	/**
	 * Set when a `BodyEditor` parser fell back to plain text on its initial
	 * load — meaning structural markdown (headings, lists, tables) was
	 * flattened. Surfaced in the same banner as parse diagnostics so the
	 * user knows their formatting will be lost on next save.
	 */
	let bodyParseFallback = $state<string | null>(null);
	function handleBodyParseFallback(err: unknown) {
		bodyParseFallback = err instanceof Error ? err.message : String(err);
	}
	$effect(() => {
		if (editorStore.diagnostics.length > 0 || bodyParseFallback) {
			bannerDismissed = false;
		}
	});

	$effect(() => {
		const nextDocument = documentContent;

		untrack(() => {
			if (nextDocument === lastEmittedDocument) return;
			if (!quillmarkService.isReady()) return;
			// Empty content has no QUILL frontmatter — wasm parser would throw.
			// Skip until the parent feeds real content.
			if (!nextDocument) return;

			// `initFromDocument` parses once and no-ops via `Document.equals`
			// when the upstream value is just a re-emission of our canonical
			// markdown — no per-keystroke serialize comparison needed.
			try {
				editorStore.initFromDocument(nextDocument, quillmarkService.Document);
				placeholderInsertAt = null;
			} catch (err) {
				console.error('[VisualEditor] Failed to parse document:', err);
			}
		});
	});

	/**
	 * Static schema lookup from `quill.schema` (wasm 0.73+). Schemas don't
	 * depend on document state; resolving the quill ref is enough.
	 */
	const quillSchema = $derived.by<{
		main?: FormSchema;
		card_types?: Record<string, FormSchema>;
	} | null>(() => {
		if (!quillRef) return null;
		try {
			return quillmarkService.getQuill(quillRef).schema;
		} catch {
			return null;
		}
	});

	const mainSchema = $derived<FormSchema | null>(quillSchema?.main ?? null);
	function cardSchemaForTag(tag: string): FormSchema | null {
		return quillSchema?.card_types?.[tag] ?? null;
	}

	const mainHideBody = $derived(
		(mainSchema?.body as { enabled?: boolean } | undefined)?.enabled === false
	);
	function cardHideBody(tag: string): boolean {
		const body = cardSchemaForTag(tag)?.body as { enabled?: boolean } | undefined;
		return body?.enabled === false;
	}

	function handlePrimaryBodyChange(markdown: string) {
		editorStore.setMainBody(markdown);
		emitDocumentChange();
	}

	function handleCardBodyChange(index: number, newBody: string) {
		editorStore.setCardBody(index, newBody);
		emitDocumentChange();
	}

	function handleAddCard(insertAt: number) {
		// With a single allowed tag, skip the picker and insert directly.
		// Otherwise open a UI-only placeholder so the user can pick a tag
		// before we commit the card to the wasm Document.
		if (cardTypes.length === 0) return;
		if (cardTypes.length === 1) {
			promoteToCard(insertAt, cardTypes[0]);
			return;
		}
		placeholderInsertAt = insertAt;
	}

	function promoteToCard(insertAt: number, tag: string) {
		const newIndex = editorStore.addCard(insertAt, tag, getBlankCardDefaults(tag));
		if (newIndex < 0) return;
		placeholderInsertAt = null;
		setActiveCardId(newIndex);
		pendingScrollCardIndex = newIndex;
		emitDocumentChange();
	}

	/**
	 * Default frontmatter for a freshly inserted card, sourced from
	 * `quill.blankCard(tag).values` (wasm 0.64+). Each entry is `{ value,
	 * default, source }`; we take `default` whenever `source === 'default'`
	 * and skip `'missing'` fields so the card's frontmatter stays minimal.
	 */
	function getBlankCardDefaults(tag: string): Record<string, unknown> {
		if (!quillRef) return {};
		try {
			const quill = quillmarkService.getQuill(quillRef);
			const blank = quill.blankCard(tag) as {
				values?: Record<string, { source: string; default: unknown }>;
			} | null;
			if (!blank?.values) return {};
			const defaults: Record<string, unknown> = {};
			for (const [name, entry] of Object.entries(blank.values)) {
				if (entry.source === 'default') defaults[name] = entry.default;
			}
			return defaults;
		} catch {
			return {};
		}
	}

	function dismissPlaceholder() {
		placeholderInsertAt = null;
	}

	function handleMoveCard(index: number, direction: 'up' | 'down') {
		const target = direction === 'up' ? index - 1 : index + 1;
		const ok = editorStore.moveCardTo(index, target);
		if (!ok) return;
		// Update active selection so the moved card stays focused.
		if (activeCardId === index) setActiveCardId(target);
		if (direction === 'up') pendingKeepInViewCardIndex = target;
		// Card indices have shifted; drop any pending placeholder rather than
		// risk it surfacing in a stale slot.
		placeholderInsertAt = null;
		emitDocumentChange();
	}

	function handleDeleteCard(index: number) {
		editorStore.removeCard(index);
		if (activeCardId === index) setActiveCardId(null);
		placeholderInsertAt = null;
		emitDocumentChange();
	}

	function emitDocumentChange() {
		const docString = editorStore.toDocumentString();
		lastEmittedDocument = docString;
		onDocumentChange(docString);
	}

	export function focus() {
		primaryBodyEditor?.focus();
	}

	export function handleFormat(type: string) {
		if (type === 'foldFrontmatter') return;
		primaryBodyEditor?.handleFormat(type);
	}
</script>

<div
	class="rich-text-editor relative flex flex-col flex-1 min-h-0"
	role="application"
	aria-label="Rich text editor"
>
	{#if (editorStore.diagnostics.length > 0 || bodyParseFallback) && !bannerDismissed}
		<div class="flex items-start gap-2 bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-2 shrink-0">
			<div class="flex-1 min-w-0">
				{#if bodyParseFallback}
					<div class="truncate"><span class="font-medium">Formatting flattened:</span> body content couldn't be parsed and was loaded as plain text. Saving will discard the original structure.</div>
				{/if}
				{#each editorStore.diagnostics as diag (diag.message)}
					<div class="truncate"><span class="font-medium capitalize">{diag.severity}:</span> {diag.message}</div>
				{/each}
			</div>
			<button
				type="button"
				class="shrink-0 ml-2 opacity-70 hover:opacity-100"
				aria-label="Dismiss parse warnings"
				onclick={() => { bannerDismissed = true; bodyParseFallback = null; }}
			>&#x2715;</button>
		</div>
	{/if}
	<div class="flex-1 min-h-0 overflow-auto bg-background p-4 md:p-6">
		<div class="primary-section">
			<EditorBlock
				label="Document"
				variant="primary"
				hideLabel={true}
				isActive={activeCardId === 'main'}
				onclick={() => setActiveCardId('main')}
			>
				<MetadataWidget
					schema={mainSchema}
					{quillRef}
					{cardTypes}
					onChange={emitDocumentChange}
					context="frontmatter"
					target={{ kind: 'main' }}
					store={editorStore}
				/>

				{#if !mainHideBody}
					<BodyEditor
						bind:this={primaryBodyEditor}
						content={mainBody}
						placeholder={getRandomMessage('placeholder')}
						onChange={handlePrimaryBodyChange}
						onParseFallback={handleBodyParseFallback}
					/>
				{/if}
			</EditorBlock>

			<AddCardTrigger
				onAdd={() => handleAddCard(0)}
				isLast={cards.length === 0 && placeholderInsertAt === null}
			/>
		</div>

		{#if placeholderInsertAt === 0}
			{@render cardPlaceholder()}
		{/if}

		<div class="cards-container">
			{#each cards as card, index (index)}
				<div class="card-section" animate:flip={{ duration: 300 }}>
					<div class="card-wrapper" use:cardScrollAction={{ scrollNew: pendingScrollCardIndex === index, keepInView: pendingKeepInViewCardIndex === index }}>
						<EditorBlock
							label={getCardName(card)}
							variant="card"
							isActive={activeCardId === index}
							isFirst={index === 0}
							isLast={index === cards.length - 1}
							onLabelChange={(newName) => handleCardNameChange(index, newName)}
							onMoveUp={() => handleMoveCard(index, 'up')}
							onMoveDown={() => handleMoveCard(index, 'down')}
							onDelete={() => handleDeleteCard(index)}
							onclick={() => setActiveCardId(index)}
						>
							<MetadataWidget
								schema={cardSchemaForTag(card.tag)}
								{quillRef}
								{cardTypes}
								context="card"
								onChange={emitDocumentChange}
								target={{ kind: 'card', index }}
								store={editorStore}
							/>

							<div class="border-t border-border/30">
								{#if !cardHideBody(card.tag)}
									<BodyEditor
										bind:this={cardEditors[index]}
										content={card.body}
										placeholder={getRandomMessage('placeholder')}
										onChange={(newBody) => handleCardBodyChange(index, newBody)}
										onParseFallback={handleBodyParseFallback}
									/>
								{/if}
							</div>
						</EditorBlock>
					</div>

					<AddCardTrigger
						onAdd={() => handleAddCard(index + 1)}
						isLast={index === cards.length - 1 && placeholderInsertAt === null}
					/>

					{#if placeholderInsertAt === index + 1}
						{@render cardPlaceholder()}
					{/if}
				</div>
			{/each}
		</div>

		<div class="min-h-[40vh]"></div>
	</div>
</div>

{#snippet cardPlaceholder()}
	<div class="card-section" data-placeholder>
		<div class="flex items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-muted/30 px-4 py-3">
			<div class="flex flex-col gap-1 flex-1 min-w-0">
				<span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Choose card type
				</span>
				<div class="w-64 max-w-full">
					<CardTypeSelector
						value={null}
						items={[...cardTypes]}
						onSelect={(tag) => promoteToCard(placeholderInsertAt!, tag)}
						autoFocus={true}
					/>
				</div>
			</div>
			<button
				type="button"
				class="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				aria-label="Cancel new card"
				onclick={dismissPlaceholder}
			>
				<X class="h-4 w-4" />
			</button>
		</div>
	</div>
{/snippet}
