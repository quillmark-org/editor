<script lang="ts">
	/**
	 * BodyEditor - Reusable Lexical-based rich text editor component.
	 * Used for both the primary document body and card bodies.
	 *
	 * Public surface (kept stable across the ProseMirror -> Lexical migration):
	 *   props:   content, placeholder, onChange, onParseFallback
	 *   exports: focus(), handleFormat(type), replaceRange(from, to, text)
	 */
	import { onMount, onDestroy } from 'svelte';
	import type { LexicalEditor } from 'lexical';
	import { $getRoot as getRoot } from 'lexical';
	import SelectionToolbar from './SelectionToolbar.svelte';

	import {
		createQuillmarkEditor,
		parseMarkdownInto,
		$serializeToMarkdown as serializeToMarkdown,
		applyFormat,
		type FormatType
	} from '$lib/editor/lexical';

	interface Props {
		/** Markdown content to edit */
		content: string;
		/** Placeholder text when empty */
		placeholder?: string;
		/** Callback when content changes */
		onChange: (content: string) => void;
		/**
		 * Called when the markdown parser falls back to plain text (structural
		 * content lost). Lets parents surface a diagnostic so the user knows
		 * their formatting was flattened.
		 */
		onParseFallback?: (error: unknown) => void;
	}

	let {
		content,
		placeholder = 'Enter content...',
		onChange,
		onParseFallback
	}: Props = $props();

	let editorElement: HTMLDivElement | undefined = $state();
	let containerElement: HTMLDivElement | undefined = $state();
	let editor: LexicalEditor | null = $state(null);
	let editorDispose: (() => void) | null = null;
	let initializedWithContent = $state(false);
	let isEmpty = $state(true);
	let onChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let suppressNextChange = false; // guard against echoing import back as a change
	let lastEmittedMarkdown: string | null = null;

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
			// A single empty paragraph counts as "empty" for placeholder purposes.
			return first.getType() === 'paragraph' && first.getTextContent().length === 0;
		});
	}

	function initializeEditor(container: HTMLElement, initialContent: string) {
		if (editorDispose) {
			cancelPendingChange();
			editorDispose();
			editorDispose = null;
			editor = null;
		}

		const bundle = createQuillmarkEditor({
			onError: (err) => console.error('[BodyEditor] lexical error', err)
		});
		editor = bundle.editor;
		editorDispose = bundle.dispose;

		editor.setRootElement(container);

		// Import the initial markdown. The editor.update inside parseMarkdownInto
		// fires our update listener — guard against treating the import as a
		// user-driven change.
		suppressNextChange = true;
		parseMarkdownInto(editor, initialContent ?? '', onParseFallback);
		lastEmittedMarkdown = initialContent ?? '';
		isEmpty = isDocumentEmpty(editor);

		const unregister = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
			if (suppressNextChange) {
				suppressNextChange = false;
				return;
			}
			// Skip pure selection changes — they don't mutate any node.
			const docChanged = dirtyElements.size > 0 || dirtyLeaves.size > 0;
			if (!docChanged) return;
			if (!editor) return;

			isEmpty = isDocumentEmpty(editor);

			cancelPendingChange();
			onChangeDebounceTimer = setTimeout(() => {
				if (!editor) return;
				const md = serializeMarkdownSafe(editor);
				if (md === lastEmittedMarkdown) return;
				lastEmittedMarkdown = md;
				onChange(md);
				initializedWithContent = true;
			}, 100);
		});

		// Save the listener teardown so dispose cleans it up too.
		const prevDispose = editorDispose;
		editorDispose = () => {
			try {
				unregister();
			} catch {
				/* noop */
			}
			prevDispose?.();
		};
	}

	function serializeMarkdownSafe(view: LexicalEditor): string {
		try {
			return view.getEditorState().read(() => serializeToMarkdown());
		} catch (err) {
			console.error('[BodyEditor] failed to serialize', err);
			return lastEmittedMarkdown ?? '';
		}
	}

	onMount(() => {
		if (editorElement) {
			initializeEditor(editorElement, content);
			if (content) initializedWithContent = true;
		}
	});

	$effect(() => {
		if (editorElement && content && !initializedWithContent) {
			initializeEditor(editorElement, content);
			initializedWithContent = true;
		}
	});

	onDestroy(() => {
		cancelPendingChange();
		if (editor) {
			editor.setRootElement(null);
		}
		editorDispose?.();
		editorDispose = null;
		editor = null;
	});

	export function focus() {
		editor?.focus();
	}

	/**
	 * Legacy export from the ProseMirror-era component. Lexical doesn't expose
	 * an integer-position model that maps cleanly to the old API, and no
	 * production caller currently invokes this — kept as a no-op stub so the
	 * type contract is preserved during the spike.
	 */
	export function replaceRange(_from: number, _to: number, _text: string) {
		// Intentionally empty — see comment above.
	}

	export function handleFormat(type: string) {
		if (!editor) return;
		applyFormat(editor, type as FormatType);
		editor.focus();
	}
</script>

<div class="body-editor" bind:this={containerElement}>
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

<style>
	.body-editor {
		position: relative;
		margin-top: 0.25rem;
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

	/* Inline metadata separator */
	.lexical-container :global(.qm-inline-metadata) {
		height: 2px;
		margin: 0.5rem 0;
		background: linear-gradient(90deg, transparent, var(--qm-border), transparent);
		border-radius: 1px;
		opacity: 0.6;
		pointer-events: none;
	}
</style>
