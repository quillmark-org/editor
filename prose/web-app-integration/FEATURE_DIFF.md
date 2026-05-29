# quillmark-editor: scope & roadmap

**Branch:** `integration/web-app-editor-features` · **PR:** quillmark-org/editor#11

> **Bare-minimum reset.** Scope is locked to **two editor modes (visual + markdown) + preview**.
> The editor is stripped to its smallest correct core; features return only by explicit decision,
> never carried over wholesale from `web-app`.

## Current state

`@quillmark/editor` — an embeddable package extracted from `web-app` (`tonguetoquill-web`).

| Area | web-app | quillmark-editor |
| --- | --- | --- |
| Visual editor | ProseMirror | **Lexical** |
| Markdown editor | CodeMirror 6 + lang-markdown/yaml/language-data | **same standard grammar** |
| Preview | SVG iframe + PDF, `quillmarkService` singleton | **Canvas** (`RenderSession.paint()`) + SVG/PDF fallback, injected `QuillmarkBindings` |
| `@quillmark/wasm` | `^0.85.0` | **`0.85.0`** |

### Settled decisions
- **Svelte 5** — native by construction (`peerDep svelte ^5`, `svelte` export condition,
  `@sveltejs/package`). No framework-agnostic layer, ever.
- **bits-ui** — the Svelte-native headless lib (base of web-app's `shadcn-svelte`) replaces the
  hand-rolled `src/lib/ui/` primitives. Open sub-decision: the styling layer on top — plain
  `--qm-*` CSS vs. Tailwind (no Tailwind today).
- **wasm `Document` is the single source of truth** for parsing / schema / serialization; no
  app-layer re-implementations.

## Build-back-up (return only by decision)

| # | Item | Effort | Notes |
|---|------|--------|-------|
| 1 | Native diagnostics in the error banner | LOW | wire wasm 0.85 `Document.formatDiagnostic()`; replaces web-app's `diagnostic-utils.ts` |
| 2 | Compact-field row breaking | LOW | `wizard/SchemaForm.svelte` greedily chunks compact runs (4 → **3+1**, lone full-width field) and can overflow (`gridColsClass` caps at 3, `maxFieldsPerRow` uncapped). Port web-app's even split (4 → **2+2**, lone-field `anchorCols` alignment, cap 4). |
| 3 | List edge cases | VERIFY | Backspace/Enter + nested-list input rules vs `@lexical/list`; port only on visible divergence |
| 4 | Tables | — | re-add via `@lexical/table` as a scoped feature |
| 5 | **bits-ui migration** | MED–HIGH | committed (see above). Migrate `ui/` primitives → bits-ui — fixes the a11y / focus / keyboard / interaction-state class at the root. Then resolve the styling fork + formalize the palette. Does **not** cover layout bugs (#2) or editor/preview *surface* CSS (Lexical / CodeMirror / canvas). |

## Feature-complete target

✓ present · ☐ to build · unlisted = out of target.

- **Visual editor (Lexical)** — ✓ rich text (bold/italic/underline/strike/code/links), headings,
  quote, code blocks, nested lists, cards (add/reorder/delete + schema metadata forms) · ☐ tables
  (#4) · ☐ polished compact-field layout (#2)
- **Markdown editor (CodeMirror)** — ✓ markdown + YAML/`card-yaml` highlighting
- **Preview** — ✓ canvas rendering (multi-page, responsive) + SVG/PDF fallback · ☐ native
  diagnostics (#1)
- **Look & feel** — ☐ bits-ui primitives (#5) · ☐ documented, contrast-checked `--qm-*` light/dark
  palette (consumer-overridable) · ☐ consistent interaction + dark-mode states (#5)
