<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, lineNumbers } from '@codemirror/view';
	import * as CMState from '@codemirror/state';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import {
		quillmarkDecorator,
		createQuillmarkTheme,
		createEditorKeymaps
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
				onItalic: handleItalic
			}),
			keymap.of([...defaultKeymap, ...historyKeymap]),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					onChange(update.state.doc.toString());
				}
			}),
			EditorView.lineWrapping,
			quillmarkDecorator,
			createQuillmarkTheme()
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
			editorView.dispatch({
				changes: {
					from: 0,
					to: editorView.state.doc.length,
					insert: value
				},
				scrollIntoView: true
			});
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


