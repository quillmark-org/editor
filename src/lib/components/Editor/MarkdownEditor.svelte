<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, lineNumbers } from '@codemirror/view';
	import * as CMState from '@codemirror/state';
	type StateEffectInstance = CMState.StateEffect<unknown>;
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import {
		foldKeymap,
		foldState,
		codeFolding,
		foldedRanges,
		unfoldEffect
	} from '@codemirror/language';
	import { createEditorTheme } from '$lib/utils/editor-theme';
	import {
		quillmarkDecorator,
		createQuillmarkTheme,
		quillmarkFoldService,
		foldAllMetadataBlocks,
		toggleAllMetadataBlocks,
		createEditorKeymaps,
		placeholderClickHandler
	} from '$lib/editor/codemirror';
	interface Props {
		value: string;
		onChange: (value: string) => void;
		showLineNumbers?: boolean;
		/** Unique identifier for the document, used to reset state when switching documents */
		id?: string | null;
	}

	let {
		value,
		onChange,
		showLineNumbers = false,
		id = null
	}: Props = $props();

	let editorElement: HTMLDivElement | undefined = $state();
	let editorView: EditorView | null = null;
	let isDarkTheme = $state(false);
	let lastDocId: string | null = null;



	// Build the extension list based on current settings
	function buildExtensions() {
		const extensions = [
			history(),
			// Custom keybindings from editor-keybindings module (MUST come before defaultKeymap)
			createEditorKeymaps({
				onBold: handleBold,
				onItalic: handleItalic,
				onUnderline: handleUnderline,
				onToggleFrontmatter: () => editorView && toggleAllMetadataBlocks(editorView)
			}),
			keymap.of([
				...defaultKeymap,
				...historyKeymap,
				...foldKeymap
			]),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					onChange(update.state.doc.toString());
				}
			}),
			EditorView.lineWrapping,
			createEditorTheme(),
			quillmarkDecorator,
			createQuillmarkTheme(),
			quillmarkFoldService,
			foldState,
			codeFolding({
				preparePlaceholder: (_state, range) => range,
				placeholderDOM: (view, onclick, prepared) => {
					const wrapper = document.createElement('span');
					wrapper.className = 'cm-foldPlaceholder';
					wrapper.onclick = onclick;

					const foldedText = view.state.doc.sliceString(prepared.from, prepared.to);
					const contentLines = foldedText
						.trim()
						.split('\n')
						.filter((line) => line.trim() !== '---');
					const firstLine = contentLines[0] || '';

					// Create text span for the placeholder text
					const textSpan = document.createElement('span');
					textSpan.className = 'cm-foldPlaceholder-text';

					if (firstLine) {
						// Try to parse key-value pair to colorize the key
						const colonIndex = firstLine.indexOf(':');
						if (colonIndex !== -1) {
							const key = firstLine.substring(0, colonIndex);
							const value = firstLine.substring(colonIndex);

							const delimiterSpan = document.createElement('span');
							delimiterSpan.className = 'cm-quillmark-delimiter';
							delimiterSpan.textContent = '--- ';
							textSpan.appendChild(delimiterSpan);

							const keySpan = document.createElement('span');
							keySpan.className = 'cm-quillmark-yaml-key';
							// Bold if key is all caps
							if (key === key.toUpperCase() && key !== key.toLowerCase()) {
								keySpan.style.fontWeight = 'bold';
							}
							keySpan.textContent = key;
							textSpan.appendChild(keySpan);

							const valueSpan = document.createElement('span');
							valueSpan.textContent = value + ' ';
							textSpan.appendChild(valueSpan);

							const endDelimiterSpan = document.createElement('span');
							endDelimiterSpan.className = 'cm-quillmark-delimiter';
							endDelimiterSpan.textContent = '---';
							textSpan.appendChild(endDelimiterSpan);
						} else {
							const delimiterSpan = document.createElement('span');
							delimiterSpan.className = 'cm-quillmark-delimiter';
							delimiterSpan.textContent = '--- ';
							textSpan.appendChild(delimiterSpan);

							const contentSpan = document.createElement('span');
							contentSpan.textContent = firstLine + ' ';
							textSpan.appendChild(contentSpan);

							const endDelimiterSpan = document.createElement('span');
							endDelimiterSpan.className = 'cm-quillmark-delimiter';
							endDelimiterSpan.textContent = '---';
							textSpan.appendChild(endDelimiterSpan);
						}
					} else {
						const delimiterSpan = document.createElement('span');
						delimiterSpan.className = 'cm-quillmark-delimiter';
						delimiterSpan.textContent = '--- ---';
						textSpan.appendChild(delimiterSpan);
					}
					wrapper.appendChild(textSpan);

					return wrapper;
				}
			}),
			placeholderClickHandler
		];

		// Conditionally add line numbers
		if (showLineNumbers) {
			extensions.push(lineNumbers());
		}

		return extensions;
	}

	// Extract editor creation logic to follow DRY principles
	function createEditor(content: string) {
		const startState = CMState.EditorState.create({
			doc: content,
			extensions: buildExtensions()
		});

		return new EditorView({
			state: startState,
			parent: editorElement
		});
	}

	function applyFormatting(prefix: string, suffix: string = prefix) {
		if (!editorView) return;

		const state = editorView.state;
		const selection = state.selection.main;
		const selectedText = state.doc.sliceString(selection.from, selection.to);

		let transaction;
		if (selectedText) {
			// Wrap selected text
			transaction = state.update({
				changes: {
					from: selection.from,
					to: selection.to,
					insert: `${prefix}${selectedText}${suffix}`
				},
				selection: {
					anchor: selection.from + prefix.length,
					head: selection.to + prefix.length
				}
			});
		} else {
			// Insert placeholder
			const placeholder = 'text';
			transaction = state.update({
				changes: {
					from: selection.from,
					insert: `${prefix}${placeholder}${suffix}`
				},
				selection: {
					anchor: selection.from + prefix.length,
					head: selection.from + prefix.length + placeholder.length
				}
			});
		}

		editorView.dispatch(transaction);
		editorView.focus();
	}

	function handleBold() {
		applyFormatting('**');
	}

	function handleItalic() {
		applyFormatting('*');
	}

	function handleUnderline() {
		applyFormatting('<u>', '</u>');
	}

	function handleStrikethrough() {
		applyFormatting('~~');
	}

	function handleInlineCode() {
		applyFormatting('`');
	}

	function handleQuote() {
		const state = editorView?.state;
		if (!state) return;

		const selection = state.selection.main;
		const line = state.doc.lineAt(selection.from);
		const lineText = line.text;

		if (lineText.startsWith('> ')) {
			// Remove quote
			const transaction = state.update({
				changes: {
					from: line.from,
					to: line.from + 2,
					insert: ''
				}
			});
			editorView?.dispatch(transaction);
		} else {
			// Add quote
			const transaction = state.update({
				changes: {
					from: line.from,
					insert: '> '
				}
			});
			editorView?.dispatch(transaction);
		}
		editorView?.focus();
	}

	function handleToggleFrontmatter() {
		if (!editorView) return;
		toggleAllMetadataBlocks(editorView);
	}

	function handleFoldFrontmatter() {
		if (!editorView) return;
		foldAllMetadataBlocks(editorView);
	}

	function handleBulletList() {
		const state = editorView?.state;
		if (!state) return;

		const selection = state.selection.main;
		const line = state.doc.lineAt(selection.from);
		const lineText = line.text;

		if (lineText.startsWith('- ')) {
			// Remove bullet
			const transaction = state.update({
				changes: {
					from: line.from,
					to: line.from + 2,
					insert: ''
				}
			});
			editorView?.dispatch(transaction);
		} else {
			// Add bullet
			const transaction = state.update({
				changes: {
					from: line.from,
					insert: '- '
				}
			});
			editorView?.dispatch(transaction);
		}
		editorView?.focus();
	}

	function handleNumberedList() {
		const state = editorView?.state;
		if (!state) return;

		const selection = state.selection.main;
		const line = state.doc.lineAt(selection.from);

		// Add numbered list
		const transaction = state.update({
			changes: {
				from: line.from,
				insert: '1. '
			}
		});
		editorView?.dispatch(transaction);
		editorView?.focus();
	}

	function handleLink() {
		applyFormatting('[', '](url)');
	}

	// Expose handleFormat method for external toolbar
	export function handleFormat(type: string) {
		switch (type) {
			case 'bold':
				handleBold();
				break;
			case 'italic':
				handleItalic();
				break;
			case 'underline':
				handleUnderline();
				break;
			case 'strikethrough':
				handleStrikethrough();
				break;
			case 'code':
				handleInlineCode();
				break;
			case 'quote':
				handleQuote();
				break;
			case 'bulletList':
				handleBulletList();
				break;
			case 'numberedList':
				handleNumberedList();
				break;
			case 'link':
				handleLink();
				break;
			case 'toggleFrontmatter':
				handleToggleFrontmatter();
				break;
			case 'foldFrontmatter':
				handleFoldFrontmatter();
				break;
		}
	}

	onMount(() => {
		// Detect initial theme
		isDarkTheme = document.documentElement.classList.contains('dark');

		// Create initial editor
		editorView = createEditor(value);

		// Watch for theme changes via MutationObserver
		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				if (mutation.attributeName === 'class') {
					const newIsDarkTheme = document.documentElement.classList.contains('dark');
					if (isDarkTheme !== newIsDarkTheme) {
						isDarkTheme = newIsDarkTheme;
					}
				}
			});
		});

		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class']
		});

		return () => {
			observer.disconnect();
		};
	});

	onDestroy(() => {
		editorView?.destroy();
	});

	// Update editor when value changes externally
	$effect(() => {
		if (editorView && editorView.state.doc.toString() !== value) {
			const effects: StateEffectInstance[] = [];
			let shouldRefold = false;

			// Clear all existing folds only if the document ID has changed
			// This prevents folds from being lost when the document is updated (e.g. via Wizard)
			if (id !== lastDocId) {
				const folded = foldedRanges(editorView.state);
				folded.between(0, editorView.state.doc.length, (from, to) => {
					effects.push(unfoldEffect.of({ from, to }));
				});
				lastDocId = id;
			} else {
				// Check if frontmatter is currently folded so we can restore it
				const folded = foldedRanges(editorView.state);
				// Check for any fold starting in the first few characters (frontmatter)
				folded.between(0, 10, () => {
					shouldRefold = true;
				});
			}

			// Dispatch content replacement with scroll preservation
			editorView.dispatch({
				changes: {
					from: 0,
					to: editorView.state.doc.length,
					insert: value
				},
				effects,
				scrollIntoView: true
			});

			// Restore folds after render to prevent scroll jump
			if (shouldRefold) {
				requestAnimationFrame(() => {
					if (editorView) foldAllMetadataBlocks(editorView);
				});
			}
		}
	});

	// Reconfigure editor when showLineNumbers or theme changes
	$effect(() => {
		// Track both showLineNumbers and isDarkTheme for reactivity
		// use `void` to satisfy linters that disallow unused expressions
		void showLineNumbers;
		void isDarkTheme;

		// Only reconfigure if editor already exists (not initial mount)
		if (editorView) {
			// Use requestAnimationFrame to ensure CSS custom properties have updated
			// before reconfiguring the editor with new theme extensions
			requestAnimationFrame(() => {
				if (editorView) {
					editorView.dispatch({
						effects: CMState.StateEffect.reconfigure.of(buildExtensions())
					});
				}
			});
		}
	});
</script>

<!-- Editor -->
<div class="bg-editor-background h-full overflow-hidden" bind:this={editorElement}></div>


