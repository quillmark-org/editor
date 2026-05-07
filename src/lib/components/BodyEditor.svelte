<script lang="ts">
	/**
	 * BodyEditor - Reusable ProseMirror-based rich text editor component.
	 * Used for both primary document body and card bodies.
	 */
	import { onMount, onDestroy } from 'svelte';
	import { EditorState } from 'prosemirror-state';
	import { EditorView } from 'prosemirror-view';
	import { history } from 'prosemirror-history';
	import { dropCursor } from 'prosemirror-dropcursor';
	import { gapCursor } from 'prosemirror-gapcursor';
	import type { Node } from 'prosemirror-model';
	import { toggleMark } from 'prosemirror-commands';
	import { tableEditing, fixTables } from 'prosemirror-tables';
	import SelectionToolbar from './SelectionToolbar.svelte';
	import TableControls from './TableControls.svelte';

	import {
		quillmarkSchema,
		parseMarkdown,
		serializeMarkdown,
		createQuillmarkKeymap,
		baseKeymap,
		createQuillmarkInputRules,
		isInTable,
		findTable,
		insertTable,
		toggleBulletList,
		toggleOrderedList
	} from '$lib/editor/prosemirror';
	import { keymap } from 'prosemirror-keymap';

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

	// Editor state
	let editorElement: HTMLDivElement | undefined = $state();
	let containerElement: HTMLDivElement | undefined = $state();
	let editorView: EditorView | null = $state(null);
	let initializedWithContent = $state(false);
	let isEmpty = $state(true);
	let onChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Table state tracking
	let tableElement: HTMLElement | null = $state(null);

	/**
	 * Check if a ProseMirror document is truly empty.
	 * A document is considered empty only if it contains a single empty paragraph.
	 * Any structural content (lists, headings, etc.) or text makes it non-empty.
	 */
	function isDocumentEmpty(doc: Node): boolean {
		// If there's any text content, it's not empty
		if (doc.textContent.length > 0) {
			return false;
		}

		// Check if document has only one child (should be a paragraph for empty state)
		if (doc.childCount !== 1) {
			return false;
		}

		const firstChild = doc.firstChild;
		if (!firstChild) {
			return true;
		}

		// If the first child is not a paragraph, document is not empty
		// (e.g., it could be a bullet_list, ordered_list, heading, etc.)
		if (firstChild.type.name !== 'paragraph') {
			return false;
		}

		// If the paragraph has any content (even empty text nodes from structure), check more carefully
		// An empty paragraph should have childCount of 0
		return firstChild.childCount === 0;
	}

	/**
	 * Handle format commands from the SelectionToolbar
	 */
	function handleSelectionFormat(type: string) {
		if (!editorView) return;

		const { state, dispatch } = editorView;
		const { marks } = quillmarkSchema;

		switch (type) {
			case 'bold':
				toggleMark(marks.strong)(state, dispatch);
				break;
			case 'italic':
				toggleMark(marks.em)(state, dispatch);
				break;
			case 'underline':
				toggleMark(marks.underline)(state, dispatch);
				break;
			case 'strikethrough':
				if (marks.strikethrough) {
					toggleMark(marks.strikethrough)(state, dispatch);
				}
				break;
			case 'code':
				toggleMark(marks.code)(state, dispatch);
				break;
			case 'link':
				// For now, toggle a link mark with a placeholder URL
				// In the future, this could open a link dialog
				if (marks.link) {
					const hasLink = state.doc.rangeHasMark(state.selection.from, state.selection.to, marks.link);
					if (hasLink) {
						toggleMark(marks.link)(state, dispatch);
					} else {
						const url = prompt('Enter URL:');
						if (url) {
							toggleMark(marks.link, { href: url })(state, dispatch);
						}
					}
				}
				break;
		}

		editorView.focus();
	}

	function cancelPendingChange() {
		if (onChangeDebounceTimer) {
			clearTimeout(onChangeDebounceTimer);
			onChangeDebounceTimer = null;
		}
	}

	// Initialize ProseMirror
	function initializeEditor(container: HTMLElement, initialContent: string) {

		if (editorView) {
			// Drop any pending debounced onChange — the captured doc belongs to
			// the previous editor state and would otherwise fire into the
			// freshly initialised view (or, when this component instance is
			// reused for a different card slot via key reordering, into the
			// wrong card).
			cancelPendingChange();
			editorView.destroy();
		}

		const doc = parseMarkdown(initialContent, onParseFallback);
		if (!doc) {
			console.error('Failed to parse markdown');
			return;
		}

		let state = EditorState.create({
			doc,
			plugins: [
				history(),
				// MUST be before tableEditing() so our Backspace handler (deleteSelectedRowsColumns)
				// intercepts before the table plugin's default cell-clearing behavior (Bug #8 fix)
				createQuillmarkKeymap({}),
				keymap(baseKeymap),
				// Table plugin comes after our keymap
				tableEditing(),
				createQuillmarkInputRules(),
				dropCursor(),
				gapCursor()
			]
		});

		// Fix any malformed tables in the parsed document (mismatched cell counts, etc.)
		const fix = fixTables(state);
		if (fix) {
			state = state.apply(fix.setMeta('addToHistory', false));
		}

		// Check initial empty state
		isEmpty = isDocumentEmpty(doc);

		editorView = new EditorView(container, {
			state,
			handleDOMEvents: {
				// Intercept iOS native formatting commands (Bold/Italic/etc. from the iOS
				// context menu toolbar). Without this, iOS modifies the contentEditable DOM
				// directly via execCommand, bypassing ProseMirror's state management and
				// causing reconciliation issues that leave buttons unresponsive on mobile.
				beforeinput(view, event) {
					const inputEvent = event as InputEvent;
					const { marks } = quillmarkSchema;
					switch (inputEvent.inputType) {
						case 'formatBold':
							inputEvent.preventDefault();
							toggleMark(marks.strong)(view.state, view.dispatch);
							return true;
						case 'formatItalic':
							inputEvent.preventDefault();
							toggleMark(marks.em)(view.state, view.dispatch);
							return true;
						case 'formatUnderline':
							inputEvent.preventDefault();
							toggleMark(marks.underline)(view.state, view.dispatch);
							return true;
						case 'formatStrikeThrough':
							inputEvent.preventDefault();
							if (marks.strikethrough) {
								toggleMark(marks.strikethrough)(view.state, view.dispatch);
							}
							return true;
					}
					return false;
				}
			},
			dispatchTransaction(tr) {
				if (!editorView) return;
				const newState = editorView.state.apply(tr);
				editorView.updateState(newState);

				// Update empty state
				if (tr.docChanged) {
					isEmpty = isDocumentEmpty(newState.doc);

					// Debounce onChange to avoid expensive serialization on every keystroke
					if (onChangeDebounceTimer) {
						clearTimeout(onChangeDebounceTimer);
					}
					onChangeDebounceTimer = setTimeout(() => {
						const markdown = serializeMarkdown(newState.doc);
						onChange(markdown);
						}, 100); // 100ms debounce

						initializedWithContent = true;
					}

				// Table detection: find the <table> DOM element when cursor is in a table
				if (tr.selectionSet || tr.docChanged) {
					if (isInTable(newState)) {
						const result = findTable(newState.selection.$from);
						if (result && editorView) {
							const dom = editorView.nodeDOM(result.pos);
							tableElement = (dom instanceof HTMLElement ? dom : null);
						} else {
							tableElement = null;
						}
					} else {
						tableElement = null;
					}
				}

			}
		});
	}



	// Mount
	onMount(() => {
		if (editorElement) {
			initializeEditor(editorElement, content);
			if (content) {
				initializedWithContent = true;
			}
		}
	});

	// Watch for content becoming available after mount
	$effect(() => {
		if (editorElement && content && !initializedWithContent) {
			initializeEditor(editorElement, content);
			initializedWithContent = true;
		}
	});

	onDestroy(() => {
		// Clear debounce timer to prevent memory leaks and stale updates
		cancelPendingChange();
		editorView?.destroy();
		editorView = null;
	});

	// Expose focus method
	export function focus() {
		editorView?.focus();
	}

	// Expose method to replace text at a range.
	export function replaceRange(from: number, to: number, text: string) {
		if (!editorView) return;
		editorView.dispatch(
			editorView.state.tr.replaceWith(from, to, editorView.state.schema.text(text))
		);
	}

	// Expose format handler for toolbar commands
	export function handleFormat(type: string) {
		if (!editorView) return;
		
		const { state, dispatch } = editorView;
		
		switch (type) {
			case 'bulletList':
				toggleBulletList(state, dispatch);
				editorView.focus();
				break;
			case 'numberedList':
				toggleOrderedList(state, dispatch);
				editorView.focus();
				break;
			case 'insertTable':
				insertTable(3, 3)(state, dispatch);
				editorView.focus();
				break;
		}
	}

</script>

<div class="body-editor" bind:this={containerElement}>
	<div
		bind:this={editorElement}
		class="prosemirror-container"
		class:is-empty={isEmpty}
		data-placeholder={placeholder}
	></div>

	<!-- Selection Toolbar (contextual popover) -->
	<SelectionToolbar
		{containerElement}
		onFormat={handleSelectionFormat}
	/>

	<!-- Obsidian-style Table Controls (hover zones around table edges) -->
	{#if editorView && tableElement}
		<TableControls
			{editorView}
			{tableElement}
		/>
	{/if}
</div>

<style>
	.body-editor {
		position: relative;
		margin-top: 0.25rem;
	}

	.prosemirror-container :global(.ProseMirror) {
		box-sizing: border-box;
		width: 100%;
		padding-inline: .5rem;
		padding-top: .5rem;
		padding-bottom: .5rem;
	}


	.prosemirror-container {
		font-family: var(--font-sans, system-ui, sans-serif);
		font-size: 15px;
		color: var(--qm-foreground);
		min-height: 0;
	}

	/* Placeholder styling */
	.prosemirror-container.is-empty::before {
		content: attr(data-placeholder);
		position: absolute;
		top: 0.5rem;
		left: 0.5rem;
		color: var(--qm-muted-foreground);
		opacity: 0.5;
		pointer-events: none;
		font-style: italic;
	}

	/* ProseMirror editor styles */
	.prosemirror-container :global(.ProseMirror) {
		outline: none;
	}

	.prosemirror-container :global(.ProseMirror > *:first-child) {
		margin-top: 0;
	}

	/* Lists had no vertical margin; first top-level list was flush to the editor top */
	.prosemirror-container :global(.ProseMirror > ul:first-child),
	.prosemirror-container :global(.ProseMirror > ol:first-child) {
		margin-top: 1rem;
	}

	.prosemirror-container :global(.ProseMirror p) {
		margin: 1rem 0 0 0;
		line-height: 1.5;
	}

	.prosemirror-container :global(.ProseMirror p:last-child) {
		margin-bottom: 0;
	}

	.prosemirror-container :global(.ProseMirror h1) {
		font-size: 2em;
		font-weight: 700;
		margin: 0.67em 0;
		line-height: 1.2;
	}

	.prosemirror-container :global(.ProseMirror h2) {
		font-size: 1.5em;
		font-weight: 600;
		margin: 0.75em 0;
		line-height: 1.3;
	}

	.prosemirror-container :global(.ProseMirror h3) {
		font-size: 1.25em;
		font-weight: 600;
		margin: 0.8em 0;
		line-height: 1.4;
	}

	.prosemirror-container :global(.ProseMirror ul),
	.prosemirror-container :global(.ProseMirror ol) {
		margin: 1rem 0 0 .5rem;
		padding-left: 1rem;
		list-style-type: disc;
	}
	.prosemirror-container :global(.ProseMirror ol) {
		list-style-type: decimal;
	}

	.prosemirror-container :global(.ProseMirror li > ul),
	.prosemirror-container :global(.ProseMirror li > ol) {
		margin-top: 0;
		margin-bottom: 0;
	}

	.prosemirror-container :global(.ProseMirror li > p) {
		margin-top: 0;
		margin-bottom: 0;
		line-height: 1.5;
	}

	.prosemirror-container :global(.ProseMirror li > p + p) {
		margin-top: 1em;
	}

	.prosemirror-container :global(.ProseMirror li) {
		margin: 0;
		line-height: 1.5;
	}

	.prosemirror-container :global(.ProseMirror blockquote) {
		border-left: 3px solid var(--qm-border);
		margin: 1em 0;
		padding-left: 1em;
		color: var(--qm-muted-foreground);
		font-style: italic;
	}

	.prosemirror-container :global(.ProseMirror code) {
		background: var(--qm-muted);
		padding: 0rem 0rem;
		border-radius: 3px;
		font-family: var(--font-mono, monospace);
		font-size: 0.9em;
	}

	.prosemirror-container :global(.ProseMirror pre) {
		background: var(--qm-muted);
		padding: 1em;
		border-radius: 6px;
		overflow-x: auto;
		margin: 1em 0;
	}

	.prosemirror-container :global(.ProseMirror pre code) {
		background: none;
		padding: 0;
	}

	.prosemirror-container :global(.ProseMirror hr) {
		border: none;
		border-top: 1px solid var(--qm-border);
		margin: 2em 0;
	}

	.prosemirror-container :global(.ProseMirror a) {
		color: var(--qm-accent-foreground);
		text-decoration: underline;
	}

	.prosemirror-container :global(.ProseMirror u) {
		text-decoration: underline;
	}

	.prosemirror-container :global(.ProseMirror s) {
		text-decoration: line-through;
	}

	/* Gap cursor */
	.prosemirror-container :global(.ProseMirror-gapcursor:after) {
		border-top: 1px solid var(--qm-foreground);
	}

	/* Selection */
	.prosemirror-container :global(.ProseMirror-selectednode) {
		outline: 2px solid var(--qm-accent);
		outline-offset: 2px;
	}

	/* ========================================
	   Table Styles
	   ======================================== */

	/* Table base */
	.prosemirror-container :global(.ProseMirror table) {
		border-collapse: collapse;
		width: auto;
		margin: 1em 0;
	}

	.prosemirror-container :global(.ProseMirror th),
	.prosemirror-container :global(.ProseMirror td) {
		/* Use border-hover for ~30% more contrast than base border in dark mode */
		border: 1px solid var(--qm-border-hover, var(--qm-border));
		padding: 0.4em 0.6em;
		text-align: left;
		vertical-align: top;
		position: relative;
		min-width: 4em;
		cursor: text;
	}

	.prosemirror-container :global(.ProseMirror th) {
		/* secondary (#edeff1 light / #313135 dark) gives clear elevation over td */
		background: var(--qm-secondary);
		font-weight: 600;
	}

	/* Cell selection — brand blue gives unambiguous interactive feedback */
	.prosemirror-container :global(.selectedCell) {
		background: color-mix(in srgb, var(--qm-brand) 20%, transparent);
		box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--qm-brand) 60%, transparent);
	}

	/* Ensure table doesn't overflow editor */
	.prosemirror-container :global(.ProseMirror .tableWrapper) {
		overflow-x: auto;
	}

</style>
