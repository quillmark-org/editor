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
// NOTE: TableControls (Obsidian-style hover bars) has been removed during the
// Lexical migration spike. Tables can still be inserted/edited via the
// built-in table commands; richer cell-level UI is a follow-up.
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

// ─── Lexical primitives (advanced composition) ──────────────────────────
export {
	createQuillmarkEditor,
	parseMarkdownInto,
	readMarkdown,
	QUILLMARK_TRANSFORMERS,
	InlineMetadataNode,
	$createInlineMetadataNode,
	$isInlineMetadataNode,
	applyFormat
} from './editor/lexical/index.js';
export type { QuillmarkEditorBundle, FormatType } from './editor/lexical/index.js';

// ─── Render-result helpers ───────────────────────────────────────────────
export { resultToBlob, resultToSVGPages } from './utils/render-result.js';
