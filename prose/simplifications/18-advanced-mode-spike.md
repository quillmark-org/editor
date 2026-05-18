# 18 — Advanced-mode editor: simplification spike

**Status:** Spike / discussion. No code changes.
**Goal:** decide what to do with the CodeMirror-backed "advanced" markdown view.

This document spikes two non-exclusive courses:

- **Course A — Aggressive simplification.** Delete features that exist only to mirror a parser the engine ignores.
- **Course B — Replace CodeMirror with Lexical (or another framework).**

It also states the unifying insight that the recommendation rests on.

## TL;DR

- Course A: high-value, ~1,500–2,600 LOC removable across three tiers, no spec violations introduced (most cuts *fix* spec drift).
- Course B (CodeMirror → Lexical for advanced mode): **don't.** Lexical is a block-based rich-text editor; advanced mode is a source-text view. The fit gets worse, not better, and Quillmark's frontmatter-aware syntax breaks Lexical's markdown round-trip.
- After Course A's first two tiers, the remaining advanced editor is small enough that a thin `<textarea>`/`contenteditable` becomes the natural endpoint — far simpler than swapping one framework for another.

## Lay of the land

The "advanced mode" stack as of `claude/editor-simplification-spike-3lgcs`:

| Area                                                                      | LOC   | Notes                                                                                  |
| ------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------- |
| `src/lib/editor/codemirror/quillmark-patterns.ts`                         | 1,064 | Regex-based parser: metadata blocks, YAML pairs, CARD/QUILL, `!fill`, MD bold/italic/u/links/comments/`{:placeholder:}` |
| `src/lib/editor/codemirror/quillmark-decorator.ts`                        | 609   | `ViewPlugin` consuming patterns to emit ~23 decoration classes + 1 fold widget          |
| `src/lib/editor/codemirror/quillmark-theme.ts`                            | 258   | `EditorView.theme()` mapping `--qm-*` CSS vars to ~40 selectors                          |
| `src/lib/editor/codemirror/editor-keybindings.ts`                         | 288   | List continuation, indent, B/I/U/. — **no pattern dependency**                          |
| `src/lib/editor/codemirror/quillmark-folding.ts` + `quillmark-fold-utils.ts` | 245 | Fold service + fold-everything/toggle-at-cursor utilities                                |
| `src/lib/editor/codemirror/placeholder-handler.ts`                        | 117   | Click `{:...:}` → select range                                                           |
| `src/lib/components/MarkdownEditor.svelte`                                | 296   | Wires the above; ~70 LOC of bespoke `placeholderDOM` rendering (lines 62–131)            |
| **CodeMirror-only total**                                                 | **≈2,877** | (excludes 877 LOC of tests)                                                          |

Rich/visual mode (`VisualEditor` + `BodyEditor`) **already runs on Lexical** (PR #6). Lexical handles only body content; frontmatter is owned by `editorState.svelte.ts` via the wasm `Document`. So the CodeMirror surface is **only** the source-text view.

## The unifying insight

> **The engine is the parser. The editor only edits text.**

`@quillmark/wasm` parses authoritative documents via `Document.fromMarkdown()`. `editorState.svelte.ts` is the source of truth for structured data. Everything in `quillmark-patterns.ts` is a *shadow parser* whose only job is to drive cosmetic decoration. Worse, it disagrees with the engine in concrete ways:

- **`!fill` tags.** `EXTENDED_MARKDOWN.md:29` says *"Custom tags (like `!fill`) are stripped during parsing"*. The decorator special-cases them anyway (`quillmark-decorator.ts:325–346`, `findYamlTaggedArrays` in patterns.ts). The editor styles syntax that the engine deletes.
- **Underline.** Spec lists `__` (`EXTENDED_MARKDOWN.md:71`). The decorator and toolbar use HTML `<u>...</u>` (`MarkdownEditor.svelte:205–207`, `findMarkdownUnderline` in patterns.ts). The editor encourages a syntax that diverges from the spec.
- **Thematic breaks.** Spec: `***`, `___`, `---` are *ignored* (line 78). The editor treats `---` specially as metadata-vs-HR with a custom heuristic (`isMetadataDelimiter` in patterns.ts:146–171).
- **`{:placeholder:}` is not in the spec at all.** `EXTENDED_MARKDOWN.md` and the published authoring docs make no mention. It's an editor-only convention with 117 LOC of click handler + ~50 LOC of decorator + the regex.
- **YAML pair detection.** A 100-line ad-hoc parser (`findYamlPairs`, lines 437–541) re-implements what `js-yaml`/`yaml` (already a dependency) and the wasm engine do correctly.

If we accept that the engine is the parser, the cosmetic shadow parser stops earning its keep, and a cascade follows:

```
drop shadow parser
  → drop decorator (no patterns to consume)
    → drop most of theme (no .cm-quillmark-* selectors to style)
      → drop fold widget + fold service (folding only existed for the styled blocks)
        → drop bespoke placeholderDOM in MarkdownEditor (folding is gone)
          → MarkdownEditor reduces to: history + lineWrapping + keymap + lineNumbers
            → at that size, CodeMirror itself is overkill
```

That's the cascade. The rest of this doc is the staged path to take it.

## Course A: Aggressive simplification

Three tiers, ordered by risk. Each tier stands alone; later tiers are larger wins but depend on confirming earlier ones land cleanly.

### Tier 1 — Delete features that contradict or extend the spec (~700 LOC)

Cuts that bring the editor *closer* to `EXTENDED_MARKDOWN.md`, not further:

1. **Drop `{:placeholder:}` decoration + click handler.** Not in spec. Removes `placeholder-handler.ts` (117 LOC), `findMarkdownPlaceholders` (~70 LOC) from patterns, the `markdown-placeholder` decoration paths in decorator, the click-to-select tests, and `placeholder-patterns.ts`. **Verify first:** does any consumer rely on the `{:...:}` convention? Grep `references/` shows no hits in spec docs.
2. **Drop `!fill` YAML tag styling.** `findYamlTaggedArrays` (~75 LOC) and the `yamlTagFillMark`/`yamlFillValueMark` decoration paths. The engine strips these; the editor shouldn't valorize them.
3. **Drop markdown bold/italic/underline/link decorations in source view.** ~300 LOC across patterns + decorator. In source view the user is looking at raw text by definition; coloring `**bold**` is decoration of decoration. The Lexical-backed rich mode already gives users the WYSIWYG affordance.
4. **Drop the `<u>`/`</u>` toolbar shortcut.** It encourages non-spec syntax. Keep B/I (`**`/`*`) because those are in spec; remove the underline shortcut and `findMarkdownUnderline`.

**Cascade:** the patterns module drops from 1,064 to ~400 (only metadata-block detection remains); the decorator drops from 609 to ~200; the theme loses ~25 selectors. About **700 LOC** gone, no spec drift.

### Tier 2 — Drop YAML block folding (~400 LOC)

Removes:

- `quillmark-folding.ts` (58)
- `quillmark-fold-utils.ts` (187)
- `DelimiterFoldWidget` + fold-state branches in decorator (~80)
- The 70-line `placeholderDOM` block in `MarkdownEditor.svelte:62–131`
- `foldKeymap`, `codeFolding`, `foldedRanges`, `foldState` extensions and the refold-after-external-change dance (`MarkdownEditor.svelte:243–268`)
- `Mod-.` keybinding in `editor-keybindings.ts`

**Why it's safe to cut:** Quillmark frontmatter blocks are typically <10 keys. The visual editor already abstracts frontmatter into `MetadataWidget`/`SchemaForm`, so a user who finds frontmatter visually heavy has rich mode. Folding in advanced mode protects against a problem that, by mode choice, the user already opted into.

**Cascade:** removes the only `WidgetType` subclass, the only DOM-building per-fold logic, and most of the "fold-aware" branches in the decorator. The remaining decorator does one thing: highlight the still-visible `---` delimiter and the `BLOCK_KEYWORDS` line.

### Tier 3 — Replace CodeMirror with `<textarea>` (~1,500 LOC)

After Tiers 1+2, the surviving CodeMirror responsibilities are:

- Multi-line text editing with undo
- Line wrapping
- Optional line numbers
- Save shortcut (Mod+S)
- List continuation on Enter (`editor-keybindings.ts` lines 39, 58)
- Tab/Shift+Tab indent on selection

These do not require a syntax engine. A `<textarea>` plus ~80 LOC of helpers covers all of them, except line numbers (~30 LOC of a `<pre>` gutter if anyone asks for them; the prop is currently default-`false` in `DocumentEditor.svelte`).

**Cascade after Tier 3:**

- Delete `src/lib/editor/codemirror/` entirely (≈2,580 LOC + 877 LOC of tests).
- Drop `@codemirror/*` from `package.json` (5 packages).
- `MarkdownEditor.svelte` becomes a ~120 LOC component instead of 296.
- The mental model collapses to: *advanced mode is a `<textarea>` over the same markdown string the visual editor emits*.

**What you lose:**

- Syntax color (already proposed to drop in Tier 1).
- Folding (already proposed to drop in Tier 2).
- The fancy fold-placeholder styling.

**What you keep:**

- All structural correctness (the wasm parser is unaffected).
- Undo/redo (browser-native on textarea, or 30-line stack if richer history is needed).
- Mod+S, list continuation, indent — all implementable in keydown handlers.

## Course B: Replace CodeMirror with Lexical (or another framework)

### Lexical specifically: bad fit

Lexical is already in the tree (`@lexical/* ^0.44.0`) for the visual editor. Reusing it for advanced mode is tempting but mismatched:

- **Lexical models content as nodes, not text.** The advanced view's job is to expose the raw markdown string, including `---` delimiters, `CARD: signature_card`, YAML keys, etc. Lexical's `@lexical/markdown` round-trip (`src/lib/editor/lexical/markdown.ts:52–89`) already "falls back to plain text on parse error" — i.e., it loses fidelity even on body-only content.
- **`---` is reserved for metadata in Quillmark, but `@lexical/markdown` parses `---` as a horizontal rule.** The transformer set has no hook for "ignore HR; treat as block boundary." We'd be writing custom node types and overriding markdown transformers — i.e., re-implementing a syntax engine, the very thing we'd be trying to escape.
- **Whitespace fidelity is required.** `EXTENDED_MARKDOWN.md:36` — *"Whitespace is preserved exactly as written."* Lexical normalizes whitespace and inserts implicit paragraph nodes. That breaks documents that depend on blank-line significance (which Quillmark cards do).
- **Frontmatter has no Lexical analogue.** Today `BodyEditor.svelte` strips frontmatter before Lexical sees it. For advanced mode that strategy doesn't apply — the frontmatter *is* what users want to edit.

The current `BodyEditor` plus `editorState` decomposition works precisely because it never asks Lexical to round-trip a full Quillmark document. Asking it to do so for advanced mode reverses that design.

### Other frameworks briefly considered

| Candidate                                | Verdict                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ProseMirror                              | Migrating the visual editor *away from* it was PR #6. Reintroducing it for advanced mode would mean two rich-text frameworks in the bundle. Skip.        |
| TipTap                                   | ProseMirror-based; same issue plus heavier dep tree.                                                                                                     |
| Monaco                                   | Heavier than CodeMirror, more features we don't need (LSP, IntelliSense, minimap). Worse on the simplification axis.                                     |
| Slate                                    | Same node-model mismatch as Lexical, plus React-first (Svelte bindings unofficial).                                                                      |
| Plain `<textarea>`                       | **Recommended endpoint.** No framework, no parser, no AST.                                                                                               |
| `contenteditable` + ~200 LOC custom code | Possible if line numbers / per-line selection styling matters; otherwise overkill.                                                                       |

The honest answer to the question *"can we get 80% feature parity with large simplification gains by swapping the framework?"* is: **the largest simplification gain is removing the framework, not replacing it.**

## Recommendation

1. **Land Tier 1** (~700 LOC, low risk, fixes spec drift). Each item is independently revertible.
2. **Land Tier 2** if no consumer flags YAML folding as load-bearing for their workflow. Confirm with users of `DocumentEditor` (the only export documented in `src/lib/index.ts:1–28`).
3. **Spike Tier 3 in a branch** — implement `MarkdownEditor.svelte` as a `<textarea>` and run the existing Vitest suite + manual UX check. If list continuation and Mod+S feel right, drop CodeMirror.
4. **Do not pursue Course B (Lexical) for advanced mode.** It will increase total complexity and break the spec.

## Risk notes

- **Tier 1, item 1:** if `{:placeholder:}` is used by any downstream Quillmark template author convention not captured in the spec, the click-to-select feature has a small UX value. Confirmation: no template files reference this syntax.
- **Tier 2:** users who edit a 50-line frontmatter block lose the ability to collapse it. Mitigation: rich mode covers structured frontmatter editing.
- **Tier 3:** `<textarea>`'s native undo cannot be programmatically invalidated. If we mutate the textarea's `value` from outside (e.g. mode switch), browser undo history resets. The current CodeMirror integration handles this via `dispatch({ changes })`. Acceptable; document the constraint.
- **Theme parity:** the existing `--qm-*` CSS custom properties are referenced from `quillmark-theme.ts`. After Tier 3, only the textarea background/foreground/cursor color need theming; the rest of the variables can be removed from the public theme.

## Cascade summary

```
Tier 1: spec drift fixes      →  ~700 LOC, no behavior loss for spec-conforming docs
Tier 2: drop YAML folding     →  ~400 LOC, advanced-mode UX flatter
Tier 3: drop CodeMirror       → ~1,500 LOC + 877 test LOC, 5 deps removed,
                                 MarkdownEditor reduces to ~120 LOC
─────────────────────────────────────────────────────────────────────────
After all three:               ≈2,600 production LOC, mental model: "<textarea> over a
                                markdown string; the wasm engine is the only parser."
```
