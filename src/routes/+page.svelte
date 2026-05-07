<script lang="ts">
	import { onMount } from 'svelte';
	import { DocumentEditor } from '$lib/index.js';
	import type { QuillmarkBindings } from '$lib/types.js';
	import { createBindings } from './bindings.svelte.js';

	const SAMPLE = `---
QUILL: usaf_memo@0.2.0
letterhead_title: DEPARTMENT OF THE AIR FORCE
letterhead_caption:
  - HEADQUARTERS YOUR UNIT NAME
date: 2026-05-07
memo_for:
  - ORG/SYMBOL
memo_from:
  - ORG/SYMBOL
  - Organization Name
  - 123 Street Ave
  - City ST 12345-6789
subject: Subject of the Memorandum
signature_block:
  - FIRST M. LAST, Rank, USAF
  - Duty Title
---

The \`usaf_memo\` Quill package takes care of all 33-337 formatting details. Focus on the content.

**Numbering** Top-level paragraphs like this one are automatically numbered. NEVER manually number your paragraphs.

- Use bullets for hierarchical paragraph nesting. These are automatically numbered or lettered as well.
  - Up to five levels of paragraphs are supported

Do not include a complimentary close (e.g. "Respectfully,") in official memorandums.
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
