# 01 — Trim the public surface in `lib/index.ts`

## Why it matters

`src/lib/index.ts` exposes ~25 symbols as if they were stable composition primitives. None of them are consumed externally; the only real entry point is `<DocumentEditor>` (see `src/routes/+page.svelte:3,71`). Treating internals as public API blocks every cleanup downstream — once `BodyEditor`, `EditorBlock`, the Lexical primitives, etc. are public, every signature change becomes a breaking change for hypothetical consumers that don't exist.

Collapsing the surface to "what `+page.svelte` actually imports" unblocks proposals #02–#12.

## Evidence

`src/lib/index.ts` exports four buckets beyond `DocumentEditor`:

```
// ─── Lower-level building blocks ─────────────────────────────────────────
export { default as BodyEditor } from './components/BodyEditor.svelte';
export { default as MetadataWidget } from './components/MetadataWidget.svelte';
export { default as RichTextToolbar } from './components/RichTextToolbar.svelte';
export { default as AdvancedToolbar } from './components/AdvancedToolbar.svelte';
export { default as SelectionToolbar } from './components/SelectionToolbar.svelte';
export { default as EditorModeSwitch } from './components/EditorModeSwitch.svelte';
export { default as EditorBlock } from './components/EditorBlock.svelte';

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
```

Cross-checked against the codebase (`grep -rn` for each name, excluding self-imports):

- `RichTextToolbar`, `AdvancedToolbar`, `ToolbarContainer`, `ToolbarButton`, `ToolbarSeparator` — no internal callers; never used by `DocumentEditor`. The `<DocumentEditor>` flow uses `SelectionToolbar` only (via `BodyEditor`).
- `BodyEditor`, `MetadataWidget`, `EditorBlock`, `EditorModeSwitch`, `SelectionToolbar` — used only by `VisualEditor`/`DocumentEditor`/`MarkdownField` internally.
- `EditorStateStore` — used only by `VisualEditor`.
- `createQuillmarkEditor`, `parseMarkdownInto`, `readMarkdown`, `QUILLMARK_TRANSFORMERS`, `InlineMetadataNode`, `$createInlineMetadataNode`, `$isInlineMetadataNode`, `applyFormat`, `QuillmarkEditorBundle`, `FormatType` — used only by `BodyEditor` internally.
- `tryGetQuillmarkContext` — used only inside `DocumentEditor.svelte:64`.
- `EditorTarget` and `CardView` in `src/lib/types.ts:81-90` — never read; covered separately in proposal #07.

The genuine external surface is `DocumentEditor` + `setQuillmarkContext` + the type aliases used in props (`QuillmarkBindings`, `RenderResult`, `QuillmarkDiagnostic`, `EditorMode`, `QuillInfo`, `FormSchema`, `SchemaField`, `RenderArtifact`, `RenderFormat`, `RenderOptions`) + `resultToBlob`/`resultToSVGPages`.

## What to change

In `src/lib/index.ts`, keep:

```ts
export { default as DocumentEditor } from './components/DocumentEditor.svelte';
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
export { resultToBlob, resultToSVGPages } from './utils/render-result.js';
```

Delete the rest. (Specifically: `MarkdownEditor`, `VisualEditor`, `Preview`, `BodyEditor`, `MetadataWidget`, `RichTextToolbar`, `AdvancedToolbar`, `SelectionToolbar`, `EditorModeSwitch`, `EditorBlock`, `EditorStateStore`, all Lexical primitives, `tryGetQuillmarkContext`, `EditorTarget`, `CardView`.)

If `MarkdownEditor`, `VisualEditor`, and `Preview` need to remain as separately-importable components for advanced use, keep just those three — but the rest are not needed.

## Risk / verification

- `npm run package` should still succeed; the published `dist/index.d.ts` will simply be smaller.
- The reference playground (`src/routes/+page.svelte`) only imports `DocumentEditor` and `QuillmarkBindings`; no risk.
- No `node_modules`-published consumer of this branch exists yet — `peerDependencies.svelte: "^5"` and the version string `0.1.0` indicate pre-release.

## Cascade

- Unblocks #02 (parsing module deletion — its exports also leave via this file).
- Unblocks #06 (dead-code prune — `MarkdownEditor.handleFormat`, `BodyEditor.replaceRange`, etc. stop being public).
- Unblocks #07 (delete the contradictory type aliases).
- Unblocks #12 (delete `InlineMetadataNode` machinery).
- Unblocks #13 (drop CodeMirror entirely — `MarkdownEditor` stops being public).
