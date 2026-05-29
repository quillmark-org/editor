<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import MarkdownEditor from './MarkdownEditor.svelte';
	import VisualEditor from './VisualEditor.svelte';
	import Preview from './Preview.svelte';
	import EditorModeSwitch from './EditorModeSwitch.svelte';
	import { ResizableSplit } from '$lib/editor/resizable-split.svelte';
	import { setQuillmarkContext } from '$lib/context.js';
	import type { QuillmarkBindings, EditorMode } from '$lib/types.js';

	interface Props {
		/** The markdown source — bound, two-way. */
		markdown?: string;
		/** Editor mode — bound, two-way. */
		mode?: EditorMode;
		/** The quillmark bindings. Required. */
		bindings: QuillmarkBindings;
		/** Layout. `split` shows editor + preview; `editor-only` and
		 *  `preview-only` show just one. */
		layout?: 'split' | 'editor-only' | 'preview-only';
		/** Show line numbers in the markdown editor. */
		showLineNumbers?: boolean;
		/** Debounce window for the preview render, in ms. Defaults to 80. */
		previewDebounceMs?: number;
		/** Called when the markdown changes (debounced via this component). */
		onChange?: (markdown: string) => void;
		/** Called when the preview transitions success/failure. */
		onPreviewStatusChange?: (success: boolean) => void;
		/** Called when the user presses Mod-S. Default: no-op. */
		onSave?: () => void;
		/** Called when an unrecoverable render or parse error occurs. */
		onError?: (err: unknown) => void;
		/** Class for the outermost wrapper. */
		class?: string;
	}

	let {
		markdown = $bindable(''),
		mode = $bindable('rich'),
		bindings,
		layout = 'split',
		showLineNumbers = false,
		previewDebounceMs = 80,
		onChange,
		onPreviewStatusChange,
		onSave,
		onError,
		class: className = ''
	}: Props = $props();

	// Install bindings on context for descendants. Captured once at mount —
	// `bindings` is conceptually immutable per editor instance (consumer
	// rebuilds the editor when swapping engines).
	const ctx = bindings;
	setQuillmarkContext(ctx);

	// Resolve the quill reference from the document and keep `resolvedQuillRef`
	// up to date with whatever has been successfully ensured.
	let debouncedContent = $state(markdown);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const next = markdown;
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debouncedContent = next;
		}, previewDebounceMs);
		return () => clearTimeout(debounceTimer);
	});

	let resolvedQuillRef = $state<string | null>(null);

	// Derive the quill ref straight from the wasm parser — the single source
	// of truth — rather than regex-matching frontmatter. (wasm 0.85 moved the
	// ref into the root `~~~card-yaml` block's `$quill` key; a `---`/`QUILL:`
	// regex no longer matches.)
	const parsedQuillName = $derived.by<string | null>(() => {
		if (!debouncedContent || !ctx.isReady) return null;
		let doc: import('@quillmark/wasm').Document | null = null;
		try {
			doc = ctx.parseDocument(debouncedContent);
			return doc.quillRef || null;
		} catch {
			return null;
		} finally {
			doc?.free();
		}
	});

	$effect(() => {
		const ref = parsedQuillName;
		if (!ctx.isReady || !ref) {
			resolvedQuillRef = null;
			return;
		}
		if (resolvedQuillRef !== ref) {
			resolvedQuillRef = null;
		}
		let cancelled = false;
		ctx.ensureQuillResolved(ref)
			.then(() => {
				if (!cancelled && parsedQuillName === ref) resolvedQuillRef = ref;
			})
			.catch((err) => {
				if (!cancelled && parsedQuillName === ref) {
					resolvedQuillRef = null;
					onError?.(err);
				}
			});
		return () => {
			cancelled = true;
		};
	});

	// Card-type tags from `info.cardTypes`, used by the visual editor.
	const cardTypes = $derived.by<readonly string[]>(() => {
		const ref = parsedQuillName;
		if (!ref || ref !== resolvedQuillRef) return [];
		try {
			return ctx.getQuillInfo(ref).cardTypes;
		} catch {
			return [];
		}
	});

	function handleEditorChange(next: string) {
		markdown = next;
		onChange?.(next);
	}

	function handleVisualChange(next: string) {
		markdown = next;
		onChange?.(next);
	}

	function setMode(next: EditorMode) {
		if (next === mode) return;
		mode = next;
	}

	let visualEditorActiveCardId = $state<number | 'main' | null>(null);

	// Mod-S → onSave (consumer wires actual persistence).
	function handleKeydown(e: KeyboardEvent) {
		const isMod = (e.metaKey || e.ctrlKey) && !e.altKey;
		if (isMod && e.key === 's') {
			e.preventDefault();
			onSave?.();
		}
	}
	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
	});
	onDestroy(() => {
		window.removeEventListener('keydown', handleKeydown);
		clearTimeout(debounceTimer);
	});

	const split = new ResizableSplit();
	let splitContainerEl = $state<HTMLDivElement | null>(null);

	const editorPaneStyle = $derived(
		layout === 'split' ? `flex: 0 0 ${split.widthPercent}%;` : 'flex: 1 1 auto;'
	);
	const previewPaneStyle = $derived(
		layout === 'split' ? `flex: 0 0 ${100 - split.widthPercent}%;` : 'flex: 1 1 auto;'
	);
</script>

<div class="qm-editor qm-document-editor {className}" bind:this={splitContainerEl}>
	{#if layout !== 'preview-only'}
		<div class="qm-pane qm-editor-pane" style={editorPaneStyle}>
			<div class="qm-editor-mode-bar">
				<EditorModeSwitch
					{mode}
					onChange={setMode}
				/>
			</div>
			<div class="qm-editor-body">
				{#if mode === 'rich'}
					{#key resolvedQuillRef}
						<VisualEditor
							document={debouncedContent}
							quillRef={resolvedQuillRef}
							{cardTypes}
							onDocumentChange={handleVisualChange}
							activeCardId={visualEditorActiveCardId}
							onActiveCardIdChange={(id) => (visualEditorActiveCardId = id)}
						/>
					{/key}
				{:else}
					<MarkdownEditor
						value={markdown}
						onChange={handleEditorChange}
						{showLineNumbers}
					/>
				{/if}
			</div>
		</div>
	{/if}

	{#if layout === 'split'}
		<div
			class="qm-split-handle"
			role="separator"
			aria-orientation="vertical"
			tabindex="-1"
			onpointerdown={(e) => split.onPointerDown(e, false)}
			onpointermove={(e) => split.onPointerMove(e, splitContainerEl)}
			onpointerup={(e) => split.onPointerUp(e)}
			onpointercancel={(e) => split.onPointerCancel(e)}
			onpointerenter={() => split.onPointerEnter()}
			onpointerleave={() => split.onPointerLeave()}
		></div>
	{/if}

	{#if layout !== 'editor-only'}
		<div class="qm-pane qm-preview-pane" style={previewPaneStyle}>
			<Preview
				markdown={debouncedContent}
				quillName={resolvedQuillRef}
				{onPreviewStatusChange}
			/>
		</div>
	{/if}
</div>

<style>
	.qm-document-editor {
		display: flex;
		width: 100%;
		height: 100%;
		min-height: 24rem;
		border: 1px solid var(--qm-border);
		border-radius: var(--qm-radius);
		overflow: hidden;
		background: var(--qm-background);
	}

	.qm-pane {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.qm-editor-pane {
		border-right: 1px solid var(--qm-border);
	}

	.qm-editor-mode-bar {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding: 0.375rem 0.625rem;
		border-bottom: 1px solid var(--qm-border);
		background: var(--qm-surface);
	}

	.qm-editor-body {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
		background: var(--qm-background);
	}

	.qm-split-handle {
		flex: 0 0 6px;
		cursor: col-resize;
		background: transparent;
		transition: background-color 0.18s ease;
	}
	.qm-split-handle:hover,
	.qm-split-handle:focus-visible {
		background: var(--qm-border-hover);
		outline: none;
	}

	.qm-preview-pane {
		background: var(--qm-muted);
	}
</style>
