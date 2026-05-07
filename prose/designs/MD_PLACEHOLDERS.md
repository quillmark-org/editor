# Placeholders & fillable content

**Purpose**: High-level picture of **body placeholders** (`{:...:}`), **YAML `!fill` tags**, and the **deferred** idea of unified fill navigation—without duplicating implementation detail (that lives in code).

**Related**: [VISUAL_EDITOR.md](VISUAL_EDITOR.md) · [WIZARD_SYSTEM.md](WIZARD_SYSTEM.md) · [HOTKEYS.md](HOTKEYS.md) · [OVERLAY_SYSTEM.md](OVERLAY_SYSTEM.md) · [ACCESSIBILITY.md](ACCESSIBILITY.md) · [EXTENDED_MARKDOWN.md](../reference/EXTENDED_MARKDOWN.md)

---

## Body placeholders (`{:...:}`)

Inline markers in the **markdown body**. User **clicks** a highlighted span; the editor **selects** the full `{:` … `:}` range; **typing** replaces it in a single undo step (select-to-replace—no floating form).

**Export**: Unfilled placeholders align with Typst guillemet conversion (`«...»`) where that pipeline applies.

**Where to look in code**: Pattern detection and CodeMirror marks in `src/lib/editor/codemirror/quillmark-patterns.ts` (`findMarkdownPlaceholders`); theme in `src/lib/editor/codemirror/quillmark-theme.ts`; click/select in `src/lib/editor/codemirror/placeholder-handler.ts` and `BodyEditor.svelte` / ProseMirror placeholder selection.

**Detection**: Same exclusion idea as other markdown patterns—skip frontmatter, fenced code, inline code, link URLs, and raw HTML regions so placeholders are not matched inside those.

---

## YAML `!fill`

Optional tag on metadata fields (frontmatter / card YAML). Documented at the format level in [EXTENDED_MARKDOWN.md](../reference/EXTENDED_MARKDOWN.md). Editors may **syntax-highlight** tags; the **wizard does not** run a dedicated “fill workflow” or programmatically add/remove `!fill` today.

---

## Unified fill navigation (deferred)

An earlier product direction: **one** affordance (e.g. floating control + shortcuts) to step through “things to fill” across **both** wizard fields and body placeholders, with shared ordering and focus.

That work was **removed** from the codebase (no navigator, no fill-field store, no wizard-driven YAML tag merge for `!fill`). If it returns, it should be a **new** design doc layered on this file.

---

_For keyboard and overlay behavior shared with other UI, see [HOTKEYS.md](HOTKEYS.md) and [OVERLAY_SYSTEM.md](OVERLAY_SYSTEM.md)._
