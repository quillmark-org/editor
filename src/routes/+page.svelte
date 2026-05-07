<script lang="ts">
	import { onMount } from 'svelte';
	import { DocumentEditor } from '$lib/index.js';
	import type { QuillmarkBindings } from '$lib/types.js';
	import { createBindings } from './bindings.js';

	const SAMPLE = `---
QUILL: daf4392
TITLE: Sample document
DATE: 2026-05-07
---

# Hello, QuillMark

Edit this markdown on the left and watch the preview render on the right.

The editor supports both **rich text** (visual) and **advanced** (raw markdown) modes — toggle with the switch above.

## Features

- Round-trip markdown ↔ ProseMirror
- Live preview via injected wasm engine
- Theme via \`--qm-*\` CSS variables
- Multi-card document model

> All your content. None of your branding.
`;

	let bindings = $state<QuillmarkBindings | null>(null);
	let initError = $state<string | null>(null);
	let markdown = $state(SAMPLE);
	let mode = $state<'rich' | 'advanced'>('rich');

	onMount(async () => {
		try {
			bindings = await createBindings();
		} catch (err) {
			initError = err instanceof Error ? err.message : String(err);
			console.error('[playground] init failed:', err);
		}
	});

	function toggleDark() {
		document.documentElement.classList.toggle('qm-dark');
	}
</script>

<header>
	<div>
		<h1>@quillmark/editor</h1>
		<p>Self-contained editor package — engine injected by the consumer.</p>
	</div>
	<button type="button" class="qm-btn qm-btn-outline qm-btn-sm" onclick={toggleDark}>
		Toggle dark
	</button>
</header>

<section class="editor-host">
	{#if initError}
		<div class="status status-error">Failed to initialise wasm engine: {initError}</div>
	{:else if !bindings}
		<div class="status">Loading wasm engine…</div>
	{:else}
		<DocumentEditor {bindings} bind:markdown bind:mode />
	{/if}
</section>

<style>
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.5rem 2rem 0.75rem;
	}
	header h1 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
	}
	header p {
		margin: 0.25rem 0 0;
		color: var(--qm-muted-foreground);
		font-size: 0.875rem;
	}
	.editor-host {
		flex: 1 1 auto;
		display: flex;
		padding: 0.75rem 2rem 2rem;
		min-height: 0;
	}
	.editor-host :global(.qm-document-editor) {
		flex: 1 1 auto;
		height: calc(100vh - 7rem);
	}
	.status {
		flex: 1 1 auto;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.95rem;
		color: var(--qm-muted-foreground);
	}
	.status-error {
		color: var(--qm-error);
	}
</style>
