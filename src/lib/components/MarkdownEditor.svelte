<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, lineNumbers } from '@codemirror/view';
	import * as CMState from '@codemirror/state';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { foldKeymap, foldState, codeFolding, foldedRanges } from '@codemirror/language';
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
	}

	let {
		value,
		onChange,
		showLineNumbers = false
	}: Props = $props();

	let editorElement: HTMLDivElement | undefined = $state();
	let editorView: EditorView | null = null;
	let isDarkTheme = $state(false);



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
			// Check if frontmatter is currently folded so we can restore it
			const folded = foldedRanges(editorView.state);
			let shouldRefold = false;
			folded.between(0, 10, () => {
				shouldRefold = true;
			});

			// Dispatch content replacement with scroll preservation
			editorView.dispatch({
				changes: {
					from: 0,
					to: editorView.state.doc.length,
					insert: value
				},
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


