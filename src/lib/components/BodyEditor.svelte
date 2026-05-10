<script lang="ts">
	/**
	 * BodyEditor - Reusable Lexical-based rich text editor component.
	 * Used for both the primary document body and card bodies.
	 *
	 *   props:   content, placeholder, onChange
	 *   exports: focus(), handleFormat(type)
	 */
	import { onMount, onDestroy } from 'svelte';
	import type { LexicalEditor, NodeKey } from 'lexical';
	import {
		$getRoot as getRoot,
		$getSelection as getSelection,
		$isRangeSelection as isRangeSelection,
		$isTextNode as isTextNode,
		$isParagraphNode as isParagraphNode,
		$getNodeByKey as getNodeByKey
	} from 'lexical';
	import { $findMatchingParent as findMatchingParent } from '@lexical/utils';
	import SelectionToolbar from './SelectionToolbar.svelte';
	import SlashCommandMenu, { type SlashCommand } from './SlashCommandMenu.svelte';
	import PlusBlockMenu, { type BlockCommand } from './PlusBlockMenu.svelte';
	import { Table, List, ListOrdered, Heading1, Heading2, Quote } from 'lucide-svelte';
	import type { ComponentType } from 'svelte';

	import {
		createQuillmarkEditor,
		parseMarkdownInto,
		$serializeToMarkdown as serializeToMarkdown,
		applyFormat,
		insertTableAtSize,
		type FormatType
	} from '$lib/editor/lexical';
	import RichTextToolbar from './RichTextToolbar.svelte';

	interface Props {
		/** Markdown content to edit */
		content: string;
		/** Placeholder text when empty */
		placeholder?: string;
		/** Callback when content changes */
		onChange: (content: string) => void;
	}

	let { content, placeholder = 'Enter content...', onChange }: Props = $props();

	let editorElement: HTMLDivElement | undefined = $state();
	let containerElement: HTMLDivElement | undefined = $state();
	let isEmpty = $state(true);

	// Non-reactive: the editor handle and tracking state are imperative — exposing
	// them as $state was the source of a Svelte 5 reactivity loop.
	let editor: LexicalEditor | null = null;
	let editorDispose: (() => void) | null = null;
	let onChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let lastImportedContent: string | null = null;

	// ── Slash command state ─────────────────────────────────────────────────
	let slashVisible = $state(false);
	let slashPos = $state({ x: 0, y: 0 });
	let slashQuery = $state('');
	// Non-reactive — only needed at execution time
	let slashNodeKey: NodeKey | null = null;
	let slashStartOffset = 0;

	// ── Plus block button state ─────────────────────────────────────────────
	let plusVisible = $state(false);
	let plusPos = $state({ x: 0, y: 0 });

	// ── Shared block command list ───────────────────────────────────────────
	const BLOCK_COMMANDS: (SlashCommand & BlockCommand)[] = [
		{ id: 'table',        label: 'Table',          description: 'Insert a data table',     icon: Table as ComponentType },
		{ id: 'heading1',     label: 'Heading 1',      description: 'Large section heading',   icon: Heading1 as ComponentType },
		{ id: 'heading2',     label: 'Heading 2',      description: 'Medium section heading',  icon: Heading2 as ComponentType },
		{ id: 'bulletList',   label: 'Bullet List',    description: 'Unordered list',          icon: List as ComponentType },
		{ id: 'numberedList', label: 'Numbered List',  description: 'Numbered list',           icon: ListOrdered as ComponentType },
		{ id: 'quote',        label: 'Quote',          description: 'Block quotation',         icon: Quote as ComponentType },
	];

	// ── Slash + Plus helpers ────────────────────────────────────────────────

	/** Current caret position in viewport coordinates, just below the cursor. */
	function getCaretViewportPos(): { x: number; y: number } | null {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return null;
		const rect = sel.getRangeAt(0).getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) return null;
		return { x: rect.left, y: rect.bottom + 6 };
	}

	function closeSlash() {
		slashVisible = false;
		slashNodeKey = null;
		slashQuery = '';
	}

	/**
	 * Registered after the editor is created. Detects slash commands and
	 * empty-paragraph positions for the + button on every state update.
	 */
	function registerInteractiveDetection(ed: LexicalEditor): () => void {
		return ed.registerUpdateListener(({ editorState }) => {
			let showSlash = false;
			let newQuery = '';
			let newNodeKey: NodeKey | null = null;
			let newOffset = 0;

			let showPlus = false;
			let plusNodeKey: NodeKey | null = null;

			editorState.read(() => {
				const sel = getSelection();
				if (!isRangeSelection(sel) || !sel.isCollapsed()) return;

				const anchor = sel.anchor;
				const node = anchor.getNode();

				// ── Plus button: cursor is in an empty paragraph ──────────────
				const para = findMatchingParent(node, isParagraphNode);
				if (para && para.getTextContent() === '') {
					showPlus = true;
					plusNodeKey = para.getKey();
				}

				// ── Slash detection: only inside text nodes ───────────────────
				if (!isTextNode(node)) return;

				const text = node.getTextContent();
				const before = text.slice(0, anchor.offset);
				const lastSlash = before.lastIndexOf('/');
				if (lastSlash === -1) return;

				// Only trigger when '/' is at the start of the text or after a space
				const charBefore = lastSlash > 0 ? before[lastSlash - 1] : '';
				if (charBefore !== '' && charBefore !== ' ') return;

				const query = before.slice(lastSlash + 1);
				// A space after the slash means the command was abandoned
				if (query.includes(' ')) return;

				showSlash = true;
				newQuery = query;
				newNodeKey = node.getKey();
				newOffset = lastSlash;
			});

			// DOM reads happen outside editorState.read()
			if (showPlus && plusNodeKey) {
				const domNode = ed.getElementByKey(plusNodeKey);
				if (domNode) {
					const rect = domNode.getBoundingClientRect();
					plusPos = { x: rect.left, y: rect.top + rect.height / 2 };
					plusVisible = true;
				}
			} else {
				plusVisible = false;
			}

			if (showSlash) {
				slashQuery = newQuery;
				slashNodeKey = newNodeKey;
				slashStartOffset = newOffset;
				if (!slashVisible) {
					const pos = getCaretViewportPos();
					if (pos) {
						slashPos = pos;
						slashVisible = true;
					}
				}
			} else {
				closeSlash();
			}
		});
	}

	/**
	 * Execute a block command, optionally first stripping the slash trigger text.
	 */
	function executeBlockCommand(id: string) {
		if (!editor) return;
		closeSlash();

		const nodeKey = slashNodeKey;
		const offset = slashStartOffset;
		const queryLen = slashQuery.length;

		// If triggered via slash, delete the "/query" text first
		if (nodeKey) {
			editor.update(
				() => {
					const node = getNodeByKey(nodeKey);
					if (!isTextNode(node)) return;
					const text = node.getTextContent();
					node.setTextContent(text.slice(0, offset) + text.slice(offset + 1 + queryLen));
					node.select(offset, offset);
				},
				{
					onUpdate: () => dispatchBlockCommand(id)
				}
			);
		} else {
			dispatchBlockCommand(id);
		}
	}

	function dispatchBlockCommand(id: string) {
		if (!editor) return;
		if (id === 'table') {
			insertTableAtSize(editor, 3, 3);
		} else {
			applyFormat(editor, id as FormatType);
		}
		editor.focus();
	}

	// ───────────────────────────────────────────────────────────────────────

	function cancelPendingChange() {
		if (onChangeDebounceTimer) {
			clearTimeout(onChangeDebounceTimer);
			onChangeDebounceTimer = null;
		}
	}

	function isDocumentEmpty(view: LexicalEditor): boolean {
		return view.getEditorState().read(() => {
			const root = getRoot();
			const children = root.getChildren();
			if (children.length === 0) return true;
			if (children.length > 1) return false;
			const first = children[0];
			return first.getType() === 'paragraph' && first.getTextContent().length === 0;
		});
	}

	function serializeMarkdownSafe(view: LexicalEditor): string {
		try {
			return view.getEditorState().read(() => serializeToMarkdown());
		} catch (err) {
			console.error('[BodyEditor] failed to serialize', err);
			return lastImportedContent ?? '';
		}
	}

	function importContent(next: string) {
		if (!editor) return;
		parseMarkdownInto(editor, next ?? '');
		lastImportedContent = next ?? '';
		isEmpty = isDocumentEmpty(editor);
	}

	onMount(() => {
		if (!editorElement) return;
		const bundle = createQuillmarkEditor({
			onError: (err) => console.error('[BodyEditor] lexical error', err)
		});
		editor = bundle.editor;
		editorDispose = bundle.dispose;
		editor.setRootElement(editorElement);
		importContent(content ?? '');

		const unregister = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
			const docChanged = dirtyElements.size > 0 || dirtyLeaves.size > 0;
			if (!docChanged || !editor) return;
			isEmpty = isDocumentEmpty(editor);

			cancelPendingChange();
			onChangeDebounceTimer = setTimeout(() => {
				if (!editor) return;
				const md = serializeMarkdownSafe(editor);
				if (md === lastImportedContent) return;
				lastImportedContent = md;
				onChange(md);
			}, 100);
		});

		const unregisterDetection = registerInteractiveDetection(editor);

		const prevDispose = editorDispose;
		editorDispose = () => {
			try { unregister(); } catch { /* noop */ }
			try { unregisterDetection(); } catch { /* noop */ }
			prevDispose?.();
		};
	});

	// Re-import when the content prop changes from outside (and isn't just
	// our own emission echoing back).
	$effect(() => {
		const next = content ?? '';
		if (!editor) return;
		if (next === lastImportedContent) return;
		importContent(next);
	});

	onDestroy(() => {
		cancelPendingChange();
		if (editor) editor.setRootElement(null);
		editorDispose?.();
		editorDispose = null;
		editor = null;
	});

	export function focus() {
		editor?.focus();
	}

	export function handleFormat(type: string) {
		if (!editor) return;
		applyFormat(editor, type as FormatType);
		editor.focus();
	}

	export function handleInsertTable(rows: number, cols: number) {
		if (!editor) return;
		insertTableAtSize(editor, rows, cols);
		editor.focus();
	}
</script>

<div class="body-editor" bind:this={containerElement}>
	<div class="body-editor-toolbar">
		<RichTextToolbar
			onFormat={handleFormat}
			onInsertTable={handleInsertTable}
		/>
	</div>

	<div
		bind:this={editorElement}
		class="lexical-container"
		class:is-empty={isEmpty}
		data-placeholder={placeholder}
		contenteditable="true"
		role="textbox"
		aria-multiline="true"
		spellcheck="true"
	></div>

	<!-- Selection Toolbar (contextual popover) -->
	<SelectionToolbar
		{containerElement}
		onFormat={handleFormat}
	/>
</div>

<!-- Slash command palette -->
<SlashCommandMenu
	visible={slashVisible}
	position={slashPos}
	query={slashQuery}
	commands={BLOCK_COMMANDS}
	onSelect={executeBlockCommand}
	onClose={closeSlash}
/>

<!-- Plus block button (appears on empty lines) -->
<PlusBlockMenu
	visible={plusVisible}
	position={plusPos}
	commands={BLOCK_COMMANDS}
	onSelect={(id) => { slashNodeKey = null; dispatchBlockCommand(id); }}
/>

<style>
	.body-editor {
		position: relative;
	}

	.body-editor-toolbar {
		border-bottom: 1px solid var(--qm-border);
	}

	.lexical-container {
		box-sizing: border-box;
		width: 100%;
		padding: 0.5rem;
		font-family: var(--font-sans, system-ui, sans-serif);
		font-size: 15px;
		color: var(--qm-foreground);
		min-height: 0;
		outline: none;
	}

	/* Placeholder styling */
	.lexical-container.is-empty::before {
		content: attr(data-placeholder);
		position: absolute;
		top: 0.5rem;
		left: 0.5rem;
		color: var(--qm-muted-foreground);
		opacity: 0.5;
		pointer-events: none;
		font-style: italic;
	}

	.lexical-container :global(> *:first-child) {
		margin-top: 0;
	}

	/* Paragraphs */
	.lexical-container :global(.qm-paragraph) {
		margin: 1rem 0 0 0;
		line-height: 1.5;
	}
	.lexical-container :global(.qm-paragraph:last-child) {
		margin-bottom: 0;
	}

	/* Headings */
	.lexical-container :global(.qm-h1) {
		font-size: 2em;
		font-weight: 700;
		margin: 0.67em 0;
		line-height: 1.2;
	}
	.lexical-container :global(.qm-h2) {
		font-size: 1.5em;
		font-weight: 600;
		margin: 0.75em 0;
		line-height: 1.3;
	}
	.lexical-container :global(.qm-h3) {
		font-size: 1.25em;
		font-weight: 600;
		margin: 0.8em 0;
		line-height: 1.4;
	}

	/* Lists */
	.lexical-container :global(.qm-ul),
	.lexical-container :global(.qm-ol) {
		margin: 1rem 0 0 0.5rem;
		padding-left: 1rem;
	}
	.lexical-container :global(.qm-ul) {
		list-style-type: disc;
	}
	.lexical-container :global(.qm-ol) {
		list-style-type: decimal;
	}
	.lexical-container :global(.qm-li) {
		margin: 0;
		line-height: 1.5;
	}
	.lexical-container :global(.qm-nested-listitem) {
		list-style-type: none;
	}

	/* Quote */
	.lexical-container :global(.qm-quote) {
		border-left: 3px solid var(--qm-border);
		margin: 1em 0;
		padding-left: 1em;
		color: var(--qm-muted-foreground);
		font-style: italic;
	}

	/* Inline code + code blocks */
	.lexical-container :global(.qm-text-code) {
		background: var(--qm-muted);
		padding: 0 0.15em;
		border-radius: 3px;
		font-family: var(--font-mono, monospace);
		font-size: 0.9em;
	}
	.lexical-container :global(.qm-code-block) {
		display: block;
		background: var(--qm-muted);
		padding: 1em;
		border-radius: 6px;
		overflow-x: auto;
		margin: 1em 0;
		font-family: var(--font-mono, monospace);
		font-size: 0.9em;
	}

	/* Links */
	.lexical-container :global(.qm-link) {
		color: var(--qm-accent-foreground);
		text-decoration: underline;
	}

	/* Text formats */
	.lexical-container :global(.qm-text-bold) {
		font-weight: 700;
	}
	.lexical-container :global(.qm-text-italic) {
		font-style: italic;
	}
	.lexical-container :global(.qm-text-underline) {
		text-decoration: underline;
	}
	.lexical-container :global(.qm-text-strikethrough) {
		text-decoration: line-through;
	}
	.lexical-container :global(.qm-text-underline-strikethrough) {
		text-decoration: underline line-through;
	}

	/* Tables */
	.lexical-container :global(.qm-table) {
		border-collapse: collapse;
		width: auto;
		margin: 1em 0;
	}
	.lexical-container :global(.qm-table-cell),
	.lexical-container :global(.qm-table-cell-header) {
		border: 1px solid var(--qm-border-hover, var(--qm-border));
		padding: 0.4em 0.6em;
		text-align: left;
		vertical-align: top;
		min-width: 4em;
	}
	.lexical-container :global(.qm-table-cell-header) {
		background: var(--qm-secondary);
		font-weight: 600;
	}
</style>
