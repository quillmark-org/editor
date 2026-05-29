# web-app → quillmark-editor: Editor Feature Diff & Merge Plan

**Branch:** `integration/web-app-editor-features` · **PR:** quillmark-org/editor#11
**Updated:** 2026-05-29
**Scope:** Visual editor, Markdown editor, and Preview **only**.

## Context

`quillmark-editor` (`@quillmark/editor`) is an extracted, embeddable Svelte 5 package.
`web-app` (`tonguetoquill-web`) is the original full application the editor was lifted from.
They diverged; this branch realigns the editor on the current engine and **deliberately trims
web-app features that don't belong in a lean embeddable editor.**

| Area | web-app (SOURCE) | quillmark-editor (TARGET) |
| --- | --- | --- |
| Visual editor engine | ProseMirror | **Lexical** |
| Markdown editor | CodeMirror 6 + `lang-markdown`/`lang-yaml`/`language-data` | **CodeMirror 6 + same standard grammar** (was: custom QuillMark regex decorator — now deleted) |
| Preview render | SVG (iframe) + PDF, centralized `quillmarkService` singleton | **Canvas** via `RenderSession.paint()` + SVG/PDF fallback, injected `QuillmarkBindings` |
| `@quillmark/wasm` | `^0.85.0` | **`0.85.0`** (was `0.76.0`) |

**Guiding principle for this branch:** the wasm `Document` is the single source of truth for
parsing, schema, and serialization. Anything in web-app that re-implements parsing, schema
shaping, or document storage in app code is a **trim candidate**, not a port candidate.

---

## ✅ Done on this branch

- **`@quillmark/wasm` 0.76 → 0.85** migration (`tag`→`kind`, `Card.payloadItems`,
  `schema.card_kinds`, `setCardKind`, simplified schema-input transport — no QUILL/CARD
  sentinels, no `const`/`required`). quiver `0.7→0.11`, `@airmark/quiver `0.15→0.23`.
- **Markdown editor greenfielded** on standard CodeMirror grammar (`lang-markdown` +
  `language-data` + `lang-yaml` `yamlFrontmatter` + `markdownKeymap` + Lezer `HighlightStyle`
  on `--qm-*` tokens). Deleted ~1000 LOC of custom regex parsing
  (`editor/codemirror/`, `parsing/`).
- **Quill-ref resolution via wasm** (`parseDocument().quillRef`) instead of frontmatter regex —
  fixed the "No schema available" regression.
- Playground sample migrated to the `~~~card-yaml` / `$quill:` format.

This closes the entire **Markdown Editor** section of the original diff (we adopted the standard
highlighting and removed the custom decorator outright — the earlier "intentional or oversight?"
question is resolved: standard highlighting, no bespoke parser).

---

## The docket: trim vs. port

Disposition legend — **PORT** (worth bringing over) · **TRIM** (explicit non-goal; do not port) ·
**VERIFY** (likely already fine via Lexical/wasm; confirm, don't build) · **DEFER** (product
decision, parked).

### Visual editor

| Feature | web-app source | Disposition | Rationale |
| --- | --- | --- | --- |
| Table visual controls (Obsidian hover handles, drag-reorder rows/cols) | `Editor/TableControls.svelte` (510 LOC) | **TRIM** | HIGH effort, ProseMirror-DOM-specific. `@lexical/table` already gives insert/edit/Tab+arrow nav. A drag-handle UX is a power-user nicety, not core to an embeddable editor. Revisit only on real demand. |
| Inline metadata nodes (preserve stray `---` YAML in body) | `prosemirror/inline-metadata-node-view.ts` + `schema.ts` | **TRIM (obsolete)** | wasm 0.85 cleanly separates `~~~card-yaml` blocks (parsed natively) from body markdown. Legacy `---`-in-body preservation no longer has a job. Confirm body round-trips, then leave dropped. |
| Placeholder patterns (`{: … :}`) | `editor/shared/placeholder-patterns.ts` (18 LOC) | **DEFER** | Trivial to copy, but only meaningful if a placeholder *UX* ships. Non-goal until the product wants placeholders. |
| Context-aware list input rules (suppress nested-list shortcut inside a list) | `prosemirror/input-rules.ts` | **VERIFY** | Small correctness polish. Check whether `@lexical/markdown` shortcuts misbehave inside lists; add a guard only if reproduced. |
| Custom list/table key handlers (Backspace cleanup, `enterOnEmptyItem`, `arrowOutOfTable`…) | `prosemirror/keymap.ts`, `list-commands.ts`, `table-commands.ts` | **VERIFY** | Mostly covered by `@lexical/list`/`@lexical/table`. Spot-check edge cases; port a single command only where Lexical visibly diverges. |

### Markdown editor

| Feature | Disposition | Rationale |
| --- | --- | --- |
| Standard markdown / YAML / fenced-code highlighting, Lezer `HighlightStyle` | **DONE** | Adopted in the greenfield rebuild. |
| Custom QuillMark metadata decorator + `quillmark-patterns.ts` (+tests) | **TRIMMED** | Deleted — redundant with native wasm parsing. |
| `stripMarkdownHtmlComments()` util | **TRIM** | Non-essential; comment handling is the engine's job, not the editor's. |
| `Mod-B` / `Mod-I` in raw markdown source | **TRIM** | Dropped with the rebuild; `AdvancedToolbar` covers formatting. Restore only if asked. |

### Preview

| Feature | web-app source | Disposition | Rationale |
| --- | --- | --- | --- |
| Robust diagnostic surfacing | `services/quillmark/diagnostic-utils.ts` | **PORT (via native 0.85)** | The genuinely worthwhile remaining item. Don't copy web-app's hand-rolled normalizer — use wasm 0.85's `Document.formatDiagnostic()` (and `formatRules()`) to render the existing `EditorStateStore.diagnostics` banner consistently. LOW. |
| Ruler / measurement overlay | `RulerOverlay/RulerOverlay.svelte` (426 LOC) + ruler store | **DEFER** | Self-contained but memo-/print-specific. Not core to a generic editor; could ship later as an opt-in slot, not baked in. |
| Thumbnail rendering (worker PNG + CacheStorage) | `services/thumbnail/*` | **TRIM** | Host-app concern (doc lists, cards). Out of scope for the editor package. |
| Full `quillmarkService` singleton (init guard, quill cache, format negotiation, download) | `services/quillmark/service.ts` (291 LOC) | **TRIM** | Conflicts with the injected-`QuillmarkBindings` model, which is the editor's deliberate architecture. Keep bindings; do not adopt the singleton. |

---

## What's actually left to do (the lean docket)

1. **Native diagnostics polish** *(PORT, LOW)* — wire `Document.formatDiagnostic()` into the
   diagnostics banner so parse/validation errors read consistently. Only essential port left.
2. **Verify list/table edge cases** *(VERIFY, LOW)* — quick manual pass on list Backspace/Enter,
   nested-list input rules, and table Tab/arrow nav against `@lexical/*`; file follow-ups only
   for concrete divergences.
3. **Confirm body round-trips without inline-metadata preservation** *(VERIFY)* — sanity-check
   that bodies containing `---` survive a parse→serialize cycle under 0.85, closing out the
   inline-metadata-node trim.

Everything else above is an explicit **non-goal** for this editor package: table drag-handles,
placeholder UX, the HTML-comment stripper, raw-source bold/italic shortcuts, thumbnail rendering,
and the `quillmarkService` singleton. They live in the host app or are superseded by wasm 0.85.

### Resolved open questions
- *Standard markdown highlighting — intentional or oversight?* → Adopted; custom decorator removed.
- *Placeholders / inline-metadata still in product direction?* → Parked (placeholders DEFER;
  inline-metadata obsolete under 0.85).
- *Thumbnails in the editor package?* → No; host-app scope.
- *wasm 0.76 → 0.85 prerequisite?* → Done.
