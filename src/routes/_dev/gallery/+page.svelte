<script lang="ts">
	import { MarkdownEditor, EditorBlock, EditorModeSwitch } from '$lib/index.js';

	const EMPTY_DOC = '';

	const SAMPLE_DOC = `---
QUILL: example123
TITLE: Sample Document
DATE: 2026-05-07
---

# Heading One

A paragraph with **bold**, _italic_, and \`inline code\` showing inline formatting.

## Heading Two

- Item one
- Item two
- Item three

> A blockquote example that wraps to show multi-line handling.

\`\`\`typescript
const greet = (name: string) => \`Hello, \${name}!\`;
\`\`\`
`;

	let emptyValue = $state(EMPTY_DOC);
	let sampleValue = $state(SAMPLE_DOC);
	let cardMode = $state<'rich' | 'advanced'>('rich');
</script>

<main class="gallery">
	<h1 class="gallery-title">@quillmark/editor — Component Gallery</h1>
	<p class="gallery-subtitle">Representative states for aesthetic and functional review.</p>

	<section class="gallery-section">
		<h2>MarkdownEditor — Empty</h2>
		<p class="section-note">Default state with no content; tests placeholder rendering and focus ring.</p>
		<div class="editor-frame" style="height: 200px;">
			<MarkdownEditor value={emptyValue} onChange={(v) => (emptyValue = v)} showLineNumbers={false} />
		</div>
	</section>

	<section class="gallery-section">
		<h2>MarkdownEditor — With Content + Line Numbers</h2>
		<p class="section-note">Frontmatter + headings + lists + code fence; tests syntax highlighting and scroll.</p>
		<div class="editor-frame" style="height: 340px;">
			<MarkdownEditor
				value={sampleValue}
				onChange={(v) => (sampleValue = v)}
				showLineNumbers={true}
			/>
		</div>
	</section>

	<section class="gallery-section">
		<h2>EditorBlock — Card Container</h2>
		<p class="section-note">Card wrapper with label, move controls, and delete; tests spacing, hover states, and button sizing.</p>
		<div class="block-demo">
			<EditorBlock
				label="Introduction"
				variant="card"
				isActive={false}
				isFirst={true}
				isLast={false}
				onMoveDown={() => {}}
				onDelete={() => {}}
			>
				{#snippet children()}
					<div class="card-body-placeholder">
						<span>Card body content area</span>
					</div>
				{/snippet}
			</EditorBlock>

			<EditorBlock
				label="Body (active)"
				variant="card"
				isActive={true}
				isFirst={false}
				isLast={true}
				onMoveUp={() => {}}
				onDelete={() => {}}
			>
				{#snippet children()}
					<div class="card-body-placeholder">
						<span>Active card — focus ring should be visible.</span>
					</div>
				{/snippet}
			</EditorBlock>
		</div>
	</section>

	<section class="gallery-section">
		<h2>EditorModeSwitch</h2>
		<p class="section-note">Toggle between Rich Text and Advanced modes; tests icon alignment and hover state.</p>
		<div class="control-frame">
			<EditorModeSwitch mode={cardMode} onChange={(m) => (cardMode = m)} />
			<span class="mode-label">mode: <code>{cardMode}</code></span>
		</div>
	</section>
</main>

<style>
	:global(body) {
		margin: 0;
		background: var(--qm-background, #fff);
		color: var(--qm-foreground, #111);
		font-family: system-ui, sans-serif;
	}

	.gallery {
		max-width: 860px;
		margin: 0 auto;
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 3rem;
	}

	.gallery-title {
		margin: 0 0 0.25rem;
		font-size: 1.5rem;
		font-weight: 700;
	}

	.gallery-subtitle {
		margin: 0;
		font-size: 0.875rem;
		color: var(--qm-muted-foreground, #888);
	}

	.gallery-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.gallery-section h2 {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--qm-muted-foreground, #888);
	}

	.section-note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--qm-muted-foreground, #aaa);
	}

	.editor-frame {
		border: 1px solid var(--qm-border, #e5e7eb);
		border-radius: var(--qm-radius, 6px);
		overflow: hidden;
	}

	.block-demo {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.card-body-placeholder {
		padding: 1rem;
		font-size: 0.875rem;
		color: var(--qm-muted-foreground, #aaa);
		min-height: 60px;
		display: flex;
		align-items: center;
	}

	.control-frame {
		display: inline-flex;
		align-items: center;
		gap: 1.25rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--qm-border, #e5e7eb);
		border-radius: var(--qm-radius, 6px);
	}

	.mode-label {
		font-size: 0.8rem;
		color: var(--qm-muted-foreground, #888);
	}

	.mode-label code {
		font-family: monospace;
		background: var(--qm-accent, #f3f4f6);
		padding: 0.1em 0.35em;
		border-radius: 3px;
	}
</style>
