# web-app → quillmark-editor: Editor Feature Diff & Merge Plan

**Branch:** `integration/web-app-editor-features`
**Date:** 2026-05-29
**Scope:** Visual editor, Markdown editor, and Preview **only**.

## Context

`quillmark-editor` (`@quillmark/editor`) is an extracted, embeddable Svelte 5 package.
`web-app` (`tonguetoquill-web`) is the original full application the editor was lifted from.
They have since **diverged**:

| Area | web-app (SOURCE) | quillmark-editor (TARGET) |
| --- | --- | --- |
| Visual editor engine | **ProseMirror** | **Lexical** (migrated, #6) |
| Markdown editor | CodeMirror 6 + `lang-markdown`/`lang-yaml`/`language-data` grammars | CodeMirror 6 + custom QuillMark decorations only |
| Preview render | SVG (iframe) + PDF fallback, centralized `quillmarkService` singleton | **Canvas** via `RenderSession.paint()` (#10) + SVG/PDF fallback, injected `QuillmarkBindings` |
| `@quillmark/wasm` | `^0.85.0` | `0.76.0` |

Because the visual editor was re-platformed (ProseMirror → Lexical), most "missing" web-app
features are **behaviors to re-implement against Lexical**, not code to copy. The markdown
editor and preview share more architecture and have cleaner copy paths.

---

## 1. Visual Editor (ProseMirror → Lexical)

Most rich-text basics reached parity through Lexical's official plugins (`@lexical/list`,
`@lexical/table`, `@lexical/markdown`, `@lexical/link`, `@lexical/rich-text`): bold, italic,
underline, strikethrough, inline code, links, headings, blockquote, code blocks, bullet/ordered
lists w/ nesting + indent, basic table insert/edit, markdown input rules, undo/redo, the floating
SelectionToolbar, and card add/reorder/delete. quillmark-editor additionally **adds** an
`AdvancedToolbar` (metadata show/hide toggle) and `<u>` underline round-trip preprocessing in
`editor/lexical/markdown.ts` that web-app lacks.

### Missing in quillmark-editor (merge candidates)

| Feature | web-app source | Difficulty | Notes |
| --- | --- | --- | --- |
| **Table visual controls** (Obsidian-style hover handles: add row/col, drag-select, drag-reorder rows/cols) | `components/Editor/TableControls.svelte` (510 lines), `editor/prosemirror/table-commands.ts` | **HIGH** | Tied to ProseMirror `EditorView` DOM model + `moveTableRow/Column`. Needs full Lexical reimplementation against `@lexical/table` cell DOM. Largest visible regression. |
| **Inline metadata nodes** (preserve stray `---` YAML blocks in body as hidden atomic nodes so content survives round-trip) | `editor/prosemirror/schema.ts` (inline_metadata spec), `inline-metadata-node-view.ts`, `configurable-node-view.ts` | **MEDIUM** | Concept is framework-agnostic; needs a Lexical `DecoratorNode`/custom node + markdown import hook + hide CSS. |
| **Placeholder patterns** (`{: … :}` regex helper) | `editor/shared/placeholder-patterns.ts` (18 lines) | **LOW** | Framework-agnostic util. Direct copy. Only worth it if placeholder UX is wanted. |
| **Context-aware list input rules** (suppress nested-list markdown shortcut while already inside a list) | `editor/prosemirror/input-rules.ts` | **LOW–MED** | quillmark uses `@lexical/markdown` shortcuts which may create nested lists where ProseMirror would not. Add guard plugin. |
| **Custom list/table key handlers** (Backspace cleanup chains, `enterOnEmptyItem`, `arrowOutOfTable`, `goToCellBelow`, etc.) | `editor/prosemirror/keymap.ts`, `list-commands.ts`, `table-commands.ts` | **LOW–MED** | Mostly covered by `@lexical/list`/`@lexical/table`; verify edge cases and add missing commands where Lexical diverges. |

### Verify-only (likely already at parity via Lexical plugins)
List nesting/indent, table cell Tab/arrow navigation, mark input rules, undo/redo. Confirm
behavior matches rather than porting code.

---

## 2. Markdown Editor (CodeMirror 6, both sides)

**Key divergence:** quillmark-editor's CodeMirror setup imports only `@codemirror/view`,
`@codemirror/state`, `@codemirror/commands` plus its own QuillMark decorator/patterns/theme/
keybindings. It does **not** import `@codemirror/lang-markdown` (present in `package.json` but
unused), `@codemirror/lang-yaml`, `@codemirror/language-data`, or `@lezer/highlight`. So body
markdown is **not** token-highlighted — only QuillMark metadata blocks, CARD/QUILL keywords,
YAML pairs, and comments are decorated.

### Missing in quillmark-editor (merge candidates)

| Feature | web-app source | Difficulty | Notes |
| --- | --- | --- | --- |
| **Standard markdown syntax highlighting** | `lang-markdown` + `markdownKeymap`, `MarkdownEditor.svelte` | **LOW** | Package already installed; just import + add to extensions. **Decide** if it conflicts with the minimal QuillMark look — may be intentional that it's off. |
| **YAML frontmatter grammar** | `lang-yaml` `yamlFrontmatter`, `MarkdownEditor.svelte:7,34` | **LOW** | Needs `@codemirror/lang-yaml` dep. Overlaps with custom metadata decorator — choose one. |
| **Fenced-code-block language highlighting** | `@codemirror/language-data` `languages` | **LOW** | Needs dep. Pairs with `lang-markdown`. |
| **Lezer-tag `HighlightStyle`** | `utils/editor-theme.ts:68-91`, `@lezer/highlight` | **MED** | Semantic highlight vs quillmark's CSS-class decorations; can coexist. |
| **`stripMarkdownHtmlComments()` util** | `parsing/markdown-utils.ts:6-9` | **LOW** | Pure util; copy if needed. |

### quillmark-editor advantages (keep; do not regress)
QuillMark metadata-block decorator + `quillmark-patterns.ts` (delimiter vs `<hr>` vs setext
disambiguation, WeakMap caching, fenced-code tracking, 100+ tests), custom list-continuation/
Tab/Shift-Tab/format keybindings, optional line numbers, `onBold`/`onItalic` callback hooks.
These are **newer than web-app** and could flow the other direction.

---

## 3. Preview

Both share: 500ms-delayed loading spinner, dark/comfort-mode brightness filter w/ theme observer,
touch-hold undim, multi-page rendering, warning overlay, error modal, PDF fallback via
`supportedFormats`. quillmark-editor **adds** canvas rendering (`RenderSession.paint()`),
RAF-debounced `ResizeObserver` repaint, and the injected-bindings architecture — all newer.

### Missing in quillmark-editor (merge candidates)

| Feature | web-app source | Difficulty | Notes |
| --- | --- | --- | --- |
| **Ruler / measurement overlay** (click-drag measure, shift-snap, px→inch) | `components/RulerOverlay/RulerOverlay.svelte` (426 lines) + `stores/ruler.svelte.ts` | **LOW** | Self-contained component + tiny store. Cleanest standalone port. |
| **Robust diagnostic extraction** (`normalizeDiagnostic`, `extractDiagnostics`, severity mapping, `QuillmarkError`) | `services/quillmark/diagnostic-utils.ts` (85 lines), `types.ts` | **LOW** | Pure utils; extend quillmark's basic `isDiagnosticError`. High value for error UX. |
| **Thumbnail rendering** (off-main-thread PNG @100ppi, CacheStorage) | `services/thumbnail/{service,worker}.ts` | **MED** | Worker + cache; used for doc-list/card thumbnails. Needs bindings integration. May be out of scope for an editor package. |
| **Full quillmarkService wrapper** (init guard, quill cache, format negotiation, download) | `services/quillmark/service.ts` (291 lines) | **MED–HIGH** | Conflicts with quillmark-editor's injected-bindings model. Backport selected utils (diagnostics) rather than the singleton. |

---

## Recommended merge order

1. **Low-risk standalone copies** — `placeholder-patterns.ts`, `diagnostic-utils.ts` (+ better error normalization), `RulerOverlay` + ruler store.
2. **Decisions needed (config, possibly intentional regressions)** — markdown/YAML grammar highlighting in the CodeMirror editor; context-aware list input rules.
3. **Lexical re-implementations (behavior parity)** — list/table key-handler edge cases, inline metadata preservation node.
4. **Largest effort** — table visual controls (`TableControls`) reimplemented for Lexical.
5. **Probably out of editor-package scope** — thumbnail worker, full `quillmarkService` singleton (keep injected-bindings model).

### Open questions before porting
- Is the absence of standard markdown syntax highlighting in quillmark-editor **intentional** (minimal QuillMark look) or an oversight?
- Are placeholders (`{: … :}`) and inline-metadata preservation still part of the product direction?
- Should thumbnail rendering live in the editor package at all, or stay in the host app?
- WASM `0.76.0` → `0.85.0`: bumping may be a prerequisite for porting some preview behaviors.
