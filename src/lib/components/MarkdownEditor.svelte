<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, lineNumbers } from '@codemirror/view';
	import { EditorState, StateEffect } from '@codemirror/state';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { markdown, markdownKeymap } from '@codemirror/lang-markdown';
	import { yamlFrontmatter } from '@codemirror/lang-yaml';
	import { languages } from '@codemirror/language-data';
	import { createEditorTheme, createMarkdownHighlightStyle } from '$lib/utils/editor-theme';

	interface Props {
		value: string;
		onChange: (value: string) => void;
		showLineNumbers?: boolean;
	}

	let { value, onChange, showLineNumbers = false }: Props = $props();

	let editorElement: HTMLDivElement | undefined = $state();
	let editorView: EditorView | null = null;
	let isDarkTheme = $state(false);

	// Standard CodeMirror markdown grammar (with embedded code-fence language
	// highlighting via @codemirror/language-data) wrapped so a leading YAML
	// frontmatter block — and `~~~card-yaml` payloads — highlight as YAML.
	// QuillMark's document model is parsed natively by @quillmark/wasm, so the
	// editor only needs syntax highlighting here, not its own metadata parser.
	function buildExtensions() {
		const extensions = [
			history(),
			keymap.of([...defaultKeymap, ...historyKeymap, ...markdownKeymap]),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					onChange(update.state.doc.toString());
				}
			}),
			EditorView.lineWrapping,
			createEditorTheme(editorElement),
			yamlFrontmatter({ content: markdown({ codeLanguages: languages }) }),
			createMarkdownHighlightStyle()
		];

		if (showLineNumbers) {
			extensions.push(lineNumbers());
		}

		return extensions;
	}

	onMount(() => {
		isDarkTheme = editorElement?.closest('.qm-dark') != null;

		editorView = new EditorView({
			state: EditorState.create({ doc: value, extensions: buildExtensions() }),
			parent: editorElement
		});

		// Watch for theme toggles so the base theme reconfigures (the
		// HighlightStyle reads CSS variables live and needs no reconfigure).
		const observer = new MutationObserver(() => {
			const next = editorElement?.closest('.qm-dark') != null;
			if (isDarkTheme !== next) isDarkTheme = next;
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class'],
			subtree: true
		});

		return () => observer.disconnect();
	});

	onDestroy(() => {
		editorView?.destroy();
	});

	// Push external value changes into the editor.
	$effect(() => {
		if (editorView && editorView.state.doc.toString() !== value) {
			editorView.dispatch({
				changes: { from: 0, to: editorView.state.doc.length, insert: value },
				scrollIntoView: true
			});
		}
	});

	// Reconfigure when line-number visibility or the active theme changes.
	$effect(() => {
		void showLineNumbers;
		void isDarkTheme;

		if (editorView) {
			requestAnimationFrame(() => {
				editorView?.dispatch({ effects: StateEffect.reconfigure.of(buildExtensions()) });
			});
		}
	});
</script>

<div class="bg-editor-background h-full overflow-hidden" bind:this={editorElement}></div>
