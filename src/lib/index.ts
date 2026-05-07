// @quillmark/editor — public API.

// ─── Top-level components ───────────────────────────────────────────────
export { default as DocumentEditor } from './components/DocumentEditor.svelte';
export { default as MarkdownEditor } from './components/MarkdownEditor.svelte';
export { default as VisualEditor } from './components/VisualEditor.svelte';
export { default as Preview } from './components/Preview.svelte';

// ─── Lower-level building blocks ─────────────────────────────────────────
export { default as BodyEditor } from './components/BodyEditor.svelte';
export { default as MetadataWidget } from './components/MetadataWidget.svelte';
export { default as RichTextToolbar } from './components/RichTextToolbar.svelte';
export { default as AdvancedToolbar } from './components/AdvancedToolbar.svelte';
export { default as SelectionToolbar } from './components/SelectionToolbar.svelte';
export { default as TableControls } from './components/TableControls.svelte';
export { default as EditorModeSwitch } from './components/EditorModeSwitch.svelte';
export { default as EditorBlock } from './components/EditorBlock.svelte';

// ─── Engine injection ────────────────────────────────────────────────────
export { setQuillmarkContext, getQuillmarkContext, tryGetQuillmarkContext } from './context.js';
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
	EditorMode,
	EditorTarget,
	CardView
} from './types.js';

// ─── Editor model ────────────────────────────────────────────────────────
export { EditorStateStore } from './editor/editorState.svelte.js';

// ─── ProseMirror primitives (advanced composition) ───────────────────────
export {
	quillmarkSchema,
	quillmarkParser,
	quillmarkSerializer,
	parseMarkdown,
	serializeMarkdown
} from './editor/prosemirror/index.js';

// ─── Render-result helpers ───────────────────────────────────────────────
export { resultToBlob, resultToSVGPages } from './utils/render-result.js';
