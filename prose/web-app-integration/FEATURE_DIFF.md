# quillmark-editor: bare-minimum editor scope

**Branch:** `integration/web-app-editor-features` · **PR:** quillmark-org/editor#11
**Scope (locked):** exactly **two editor modes (visual + markdown) and the preview**. Nothing else.

> **Reset-to-bare-minimum directive.** The editor is stripped to the smallest correct core — two
> modes + preview — and built back up deliberately. Features are added only by explicit decision,
> not carried over wholesale from `web-app`.

## Current state

`quillmark-editor` (`@quillmark/editor`) is an embeddable Svelte 5 package extracted from
`web-app` (`tonguetoquill-web`).

| Area | web-app | quillmark-editor |
| --- | --- | --- |
| Visual editor engine | ProseMirror | **Lexical** |
| Markdown editor | CodeMirror 6 + `lang-markdown`/`lang-yaml`/`language-data` | **same standard grammar** |
| Preview render | SVG (iframe) + PDF, `quillmarkService` singleton | **Canvas** via `RenderSession.paint()` + SVG/PDF fallback, injected `QuillmarkBindings` |
| `@quillmark/wasm` | `^0.85.0` | **`0.85.0`** |

**Guiding principle:** the wasm `Document` is the single source of truth for parsing, schema, and
serialization. App-layer re-implementations of parsing / schema-shaping / document storage are
non-goals here.

## Build-back-up candidates

Only pulled in on explicit decision; none are in scope by default.

1. **Native diagnostics polish** *(LOW)* — wire wasm 0.85's `Document.formatDiagnostic()` into the
   diagnostics banner so parse/validation errors read consistently. (Supersedes web-app's
   hand-rolled `services/quillmark/diagnostic-utils.ts`.)
2. **Compact-field row breaking** *(LOW, polish)* — adopt web-app's *even-distribution* layout for
   `ui.compact` form fields. Ours (`wizard/SchemaForm.svelte` `buildLayoutSegments`) greedily
   slices runs into fixed `maxFieldsPerRow` chunks, so e.g. 4 compact fields render **3 + 1** (a
   lone full-width trailing field). web-app (`Wizard/SchemaForm.svelte`) computes
   `rows = ceil(N/capacity)` then balances evenly (4 → **2 + 2**), aligns a trailing lone field to
   the columns above it (`anchorCols`), and caps at `MAX_FIELDS_PER_ROW = 4`. Ours also lacks that
   cap while `gridColsClass` only supports up to 3 cols — a wide container can overflow.
3. **List edge cases** *(VERIFY, LOW)* — pass over list Backspace/Enter + nested-list input rules
   against `@lexical/list`; port a single command only where Lexical visibly diverges.
4. **Tables** — if wanted, re-add via `@lexical/table` as a deliberate, scoped feature.

## Feature-complete target

The definition of done — the capability set a built-up editor should reach. (✓ = present today,
☐ = to build.) Anything not listed here is simply not in the target.

**Visual editor (Lexical)**
- ✓ Rich text: bold, italic, underline, strikethrough, inline code, links
- ✓ Headings, blockquote, code blocks
- ✓ Bullet / ordered lists with nesting
- ✓ Cards: add / reorder / delete + schema-driven metadata forms
- ☐ **Tables** — insert/edit with clean markdown round-trip (via `@lexical/table`)
- ☐ Polished compact-field form layout (build-back-up #2)

**Markdown editor (CodeMirror)**
- ✓ Standard markdown + YAML / `card-yaml` syntax highlighting

**Preview**
- ✓ **Canvas rendering** via `RenderSession.paint()` — multi-page, responsive repaint
- ✓ SVG / PDF fallback for non-canvas quills
- ☐ Native diagnostic surfacing in the error banner (build-back-up #1)
