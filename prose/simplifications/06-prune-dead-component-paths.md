# 06 — Prune dead props, exports, and code paths inside live components

## Why it matters

Several live components carry props, exports, and conditional branches that are never reached because no caller wires them. Some are migration scaffolding (ProseMirror → Lexical), some are speculative public API, some are leftover from refactors. Each is small individually; together they obscure the actual contract of every component they live in.

## Evidence and cuts

### `MarkdownEditor.svelte`

- **`export function handleFormat(type: string)` (lines 325–361)** plus 9 helper handlers (`handleBold`, `handleItalic`, `handleUnderline`, `handleStrikethrough`, `handleInlineCode`, `handleQuote`, `handleBulletList`, `handleNumberedList`, `handleLink`). Comment says "Expose handleFormat method for external toolbar". `DocumentEditor` does not pipe a toolbar in. The only formatting that actually fires comes from the keymap (Mod-B/I/U) registered at line 51 — and the keymap routes through `handleBold`/`handleItalic`/`handleUnderline` inside the file. Strip the export and the 6 helpers (`handleStrikethrough`, `handleInlineCode`, `handleQuote`, `handleBulletList`, `handleNumberedList`, `handleLink`) that are not used by the keymap.

- **`id?: string | null` prop (lines 30, 36) + `lastDocId` machinery (line 43, 404–410)** — the prop is never passed by `DocumentEditor`. The `if (id !== lastDocId)` branch in the external-update effect is permanently false, so the "clear all folds when document switches" code block is dead. Delete the prop, the `lastDocId` variable, and the `if/else` — keep only the `else` branch (re-fold detection).

### `BodyEditor.svelte`

- **`export function replaceRange(_from: number, _to: number, _text: string)` (lines 143–145)** — explicit no-op, comment: "Legacy ProseMirror-era no-op; kept for type contract during the spike." The spike is over. Delete.

- **`serializeMarkdownSafe`'s try/catch (lines 74–81)** — wraps `$convertToMarkdownString(QUILLMARK_TRANSFORMERS)`. Lexical's serialization does not throw on valid editor state. Replace with a direct read.

- **JSDoc at line 8** — claims `replaceRange` is part of the public surface. Update after deletion.

### `Preview.svelte`

- **`onPreviewClick?: () => void` prop (lines 24, 27)** — never passed by `DocumentEditor`. The four `<button class="preview-iframe-mask">` overlays at lines 334, 347, 491, 540 do nothing in practice. Either:
    - **(A) Delete the prop and the four overlay buttons**, simplifying every render branch; or
    - **(B) Wire it through `DocumentEditor`** with a default that focuses the editor, so the feature actually works.

  `(A)` is the lower-friction default; `(B)` if the "click preview to start editing" gesture is desired.

### `EditorModeSwitch.svelte`

- **`onModeChange` prop (lines 9, 17)** — comment: "Backwards-compatible alias for `onChange`." The package version is `0.1.0`; there is no published `onModeChange`-era to be backwards-compatible with. `DocumentEditor.svelte:31, 50, 150` wires both. Delete `onModeChange`; keep only `onChange`. Also delete the corresponding alias on `DocumentEditor` itself.

### `DocumentEditor.svelte`

- **`showSplit`, `showEditor`, `showPreview` (lines 174–176)** — three derived booleans from a single three-valued enum (`layout: 'split' | 'editor-only' | 'preview-only'`). Read `layout` directly in the template:

  ```svelte
  {#if layout !== 'preview-only'}…{/if}
  {#if layout === 'split'}…{/if}
  {#if layout !== 'editor-only'}…{/if}
  ```

- **`tryGetQuillmarkContext` import (line 8)** — used once at line 64 to support "either prop-or-context" injection. Pick one:
    - prop-only is simpler (drop `tryGetQuillmarkContext` and the context fallback); or
    - context-only is also simpler (drop the prop, require `setQuillmarkContext` upstream).

  The dual mechanism is a 12-line knot that's never demonstrably needed.

- **`parsedQuillName` (lines 88–99)** — parses the entire markdown via wasm `parseDocument` on every debounced keystroke just to read `quillRef`. A regex `/^---\n([\s\S]*?)^---$/m` plus a `/^QUILL:\s*(\S+)/m` over the captured frontmatter gets the same answer for orders of magnitude less work. The wasm parse already happens inside `EditorStateStore.initFromDocument` and inside `bindings.render` — this third parse is redundant. Replace with a regex-based extractor.

### `VisualEditor.svelte`

- **`onModeSwitch` prop (lines 50, 62)** — currently passed to a child but the prop on `VisualEditor` itself is wrapped with `eslint-disable @typescript-eslint/no-unused-vars`. Audit and delete if truly unused.

- **`bodyParseFallback` state + banner (lines 124–132, 285–300)** — fires when `BodyEditor`'s `onParseFallback` is called. That callback fires only if Lexical's `$convertFromMarkdownString` throws — which it doesn't on plausible inputs. The migration banner is migration-scaffolding from the ProseMirror days. Validate by adding a `console.warn` inside the catch and exercising the editor; if it never triggers, delete the banner UI and the `bodyParseFallback` machinery and `BodyEditor.onParseFallback` prop.

### `WizardCore.svelte` / `MetadataWidget.svelte`

- **`originalData` (`WizardCore.svelte:54, 91, 113, 152`)** — computed via `structuredClone(normalizedData)` on every reinit and exposed in `coreState`. Only consumer is the `children` snippet at line 152. `MetadataWidget` uses `WizardCore` without passing `children`. Delete `originalData` and the snippet payload.

- **`coreState` (`WizardCore.svelte:31, 44, 110`) + `wizardState` binding (`MetadataWidget.svelte:50, 141`)** — `wizardState` is bound but never read. Delete both ends of the binding.

### `EditorBlock.svelte`

- **`onclick` capture-phase action (lines 49–60)** — registers a capture-phase click handler so it fires before any child's `stopPropagation`. This is to make "click anywhere in the block to set it active" work even when child controls stop-propagate. If the block-active highlight is rarely used or only valuable on the card variant, simplify to a regular bubble-phase handler on the wrapper and accept that some inner clicks won't activate.

## Aggregate

Roughly 120 lines deleted across 7 components, plus 4 dead props removed from public-prop contracts. The interactive contract of each component becomes self-documenting.

## Risk / verification

- `npm run check` after each cut.
- Manual smoke: bold/italic/underline shortcuts in advanced mode (Mod-B/I/U) still work; toggling between Rich and Advanced still works; opening the playground in dark and light modes still works.
- `bodyParseFallback` and `parsedQuillName` cuts need a brief validation run because they touch hot paths.

## Cascade

- After #06 + #07 + #01, every public prop on `DocumentEditor` matches a real call site.
- Removing `bodyParseFallback` interacts with #12 (the `InlineMetadataNode` machinery that motivated the fallback in the first place).
