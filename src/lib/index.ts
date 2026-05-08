// @quillmark/editor — public API.

// ─── Top-level components ───────────────────────────────────────────────
export { default as DocumentEditor } from './components/DocumentEditor.svelte';
export { default as MarkdownEditor } from './components/MarkdownEditor.svelte';
export { default as VisualEditor } from './components/VisualEditor.svelte';
export { default as Preview } from './components/Preview.svelte';

// ─── Engine injection ────────────────────────────────────────────────────
export { setQuillmarkContext, getQuillmarkContext } from './context.js';
export type {
	QuillmarkBindings,
	QuillmarkDiagnostic,
	RenderResult,
	RenderArtifact,
	RenderFormat,
	RenderOptions,
	QuillInfo,
	FormSchema,
	SchemaField,
	EditorMode
} from './types.js';

// ─── Render-result helpers ───────────────────────────────────────────────
export { resultToBlob, resultToSVGPages } from './utils/render-result.js';
