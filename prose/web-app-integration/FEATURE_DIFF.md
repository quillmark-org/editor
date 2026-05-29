# web-app → quillmark-editor: Editor Feature Diff & Merge Plan

**Branch:** `integration/web-app-editor-features` · **PR:** quillmark-org/editor#11
**Updated:** 2026-05-29
**Scope (locked):** exactly **two editor modes (visual + markdown) and the preview**. Nothing else.

> **Reset-to-bare-minimum directive.** The editor is being stripped down to the smallest correct
> core — two modes + preview — and built back up deliberately. **Explicit non-features:** tables
> (all table logic removed), tools/overlays (ruler, measurement), thumbnail rendering, and any
> dead/obsolete parsing logic (e.g. inline-metadata nodes). These are not "deferred"; they are out.

## Context

`quillmark-editor` (`@quillmark/editor`) is an extracted, embeddable Svelte 5 package.
`web-app` (`tonguetoquill-web`) is the original full application the editor was lifted from.
They diverged; this branch realigns the editor on the current engine and **strips it to a lean,
bare-minimum core.**

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
- **All table logic removed** (bare-minimum reset): dropped `@lexical/table` dep, its node
  registration + selection observer (`editor-config.ts`), the `insertTable` command + import
  (`commands.ts`), the table theme classes (`theme.ts`), the table CSS (`BodyEditor.svelte`), and
  the now-dead cell-selection toolbar suppression (`SelectionToolbar.svelte`). Verified
  `@lexical/markdown`'s default `TRANSFORMERS` carries no table transformer, so markdown import
  is unaffected.
- **Confirmed obsolete logic absent:** inline-metadata nodes, ruler/measurement overlays, and
  thumbnail rendering were never ported into this package — nothing to remove, and they stay out.

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
| **Tables — all logic** (basic `@lexical/table` insert/edit *and* web-app's drag-handle `TableControls.svelte`) | `Editor/TableControls.svelte`; here: `@lexical/table` wiring | **REMOVED** | Out of the bare-minimum core. Stripped entirely from the Lexical editor this branch (see "Done"). Not on the build-back-up list yet. |
| Inline metadata nodes (preserve stray `---` YAML in body) | `prosemirror/inline-metadata-node-view.ts` + `schema.ts` | **REMOVED / N/A** | Never existed in this package; obsolete under wasm 0.85 (which separates `~~~card-yaml` blocks from body markdown). Stays out. |
| Placeholder patterns (`{: … :}`) | `editor/shared/placeholder-patterns.ts` (18 LOC) | **OUT** | Non-goal for the bare-minimum core. |
| Context-aware list input rules (suppress nested-list shortcut inside a list) | `prosemirror/input-rules.ts` | **VERIFY** | Small correctness polish. Check whether `@lexical/markdown` shortcuts misbehave inside lists; add a guard only if reproduced. |
| Custom list key handlers (Backspace cleanup, `enterOnEmptyItem`…) | `prosemirror/keymap.ts`, `list-commands.ts` | **VERIFY** | Mostly covered by `@lexical/list`. Spot-check edge cases; port a single command only where Lexical visibly diverges. (Table key handlers are gone with tables.) |

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
| Ruler / measurement overlay | `RulerOverlay/RulerOverlay.svelte` (426 LOC) + ruler store | **OUT** | Tool/overlay — explicitly excluded from the bare-minimum core. Not ported here; stays out. |
| Thumbnail rendering (worker PNG + CacheStorage) | `services/thumbnail/*` | **OUT** | Host-app concern. Not ported here; stays out. |
| Full `quillmarkService` singleton (init guard, quill cache, format negotiation, download) | `services/quillmark/service.ts` (291 LOC) | **TRIM** | Conflicts with the injected-`QuillmarkBindings` model, which is the editor's deliberate architecture. Keep bindings; do not adopt the singleton. |

---

## Bare-minimum core: what remains, what's next

**The core is now: two editor modes (visual Lexical + markdown CodeMirror) + canvas preview.**
That's the surface to build back up from.

Build-back-up candidates (only when explicitly pulled in — none are in scope by default):
1. **Native diagnostics polish** *(LOW)* — wire `Document.formatDiagnostic()` into the diagnostics
   banner so parse/validation errors read consistently.
2. **Verify list edge cases** *(LOW)* — quick pass on list Backspace/Enter + nested-list input
   rules against `@lexical/list`; file follow-ups only for concrete divergences.
3. **Tables** — if/when wanted, re-add via `@lexical/table` as a deliberate, scoped feature (not
   the web-app drag-handle UX).

**Hard non-goals** (do not add without an explicit decision): tables, ruler/measurement tools,
thumbnail rendering, inline-metadata nodes, placeholder UX, HTML-comment stripping, raw-source
bold/italic shortcuts, and the `quillmarkService` singleton (the injected-`QuillmarkBindings`
model stays).

### Resolved open questions
- *Standard markdown highlighting — intentional or oversight?* → Adopted; custom decorator removed.
- *Placeholders / inline-metadata still in product direction?* → Parked (placeholders DEFER;
  inline-metadata obsolete under 0.85).
- *Thumbnails in the editor package?* → No; host-app scope.
- *wasm 0.76 → 0.85 prerequisite?* → Done.
