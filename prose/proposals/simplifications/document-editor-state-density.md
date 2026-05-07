# DocumentEditor State Density

**Purpose**: Make `DocumentEditor.svelte` readable again without restructuring its features.

**Status**: Proposed
**Related**: `src/lib/components/Editor/DocumentEditor.svelte`

---

## Problem

Within the first 130 lines, `DocumentEditor.svelte` declares roughly 16 `$state` fields covering at least four unrelated concerns:

| Concern | State fields |
|---|---|
| Modal visibility | `showDocumentInfo`, `showImportDialog`, `showPublishModal`, `showShareLinkModal` |
| Split-pane resize | `splitContainerElement`, `editorPaneWidthPercent`, `isResizingPanels`, `isResizerHovered`, `resizeDrag` |
| Editor plumbing | `debouncedContent`, `editorRef`, `visualEditorRef`, `editorMode`, `visualEditorActiveCardId`, `savedContent` |
| Quillmark/preview status | `hasSuccessfulPreview`, `quillmarkReady`, `resolvedQuillRef`, `editorPulse`, `lastSaveStatus` (not reactive) |

Reading the component top-to-bottom doesn't give a mental model of what it owns; state is sprinkled beside the concern's handlers rather than grouped.

## Scope

Reorganize state and behavior **without** breaking the component apart. This is a surgical cleanup, not the TopMenu-style restructuring in the sibling proposal.

Out of scope:
- Splitting `DocumentEditor` into a dozen children — it genuinely coordinates the editor surface.
- Introducing a global "editor store." There's one editor at a time, and module-level singletons make testing harder.

## Tactics (stackable)

### 1. Collapse modal flags into a union (high value, low risk)

Four mutually-exclusive modals can be one field:

```ts
let openModal = $state<'info' | 'import' | 'publish' | 'share' | null>(null);
```

Guarantees at most one modal is open, removes four toggle functions, and makes the "close everything" code path a single assignment.

### 2. Extract a `ResizableSplit` helper class (medium value)

The 5 resize fields plus the pointer handlers are a self-contained state machine. Move them into a `.svelte.ts` class with reactive fields:

```ts
export class ResizableSplit {
  widthPercent = $state(50);
  isResizing = $state(false);
  /* … */
}
```

Then `let split = new ResizableSplit();` replaces 5 `$state` lines and the handlers become methods. One callsite, so don't expose as public API — just a file-local helper.

### 3. Lift `lastSaveStatus` to `$derived` or delete it

It's declared `let … = 'idle'` (non-reactive). If it's only read for comparison against the current status, derive it: `const lastSaveStatus = $derived.by(…)`. If nothing reads it, remove.

### 4. Convert `hasSuccessfulPreview` to a callback-only signal

It's `$state` only because `onPreviewStatusChange` is notified from an effect. If the preview component already owns this knowledge, pass the callback down and let Preview call it directly — removing both the local state and the effect.

## Recommendation

Start with **1** and **2**. They are each small, obviously-correct edits that cut the state list nearly in half. Revisit **3** and **4** only if the component still feels dense afterward.

## Non-goals

- Don't introduce a `useModal()` rune for 4 call sites.
- Don't generalize `ResizableSplit` — it's used once.

## Risk

Low for (1) — mechanical refactor with a small test surface. Low-medium for (2) — reactive classes with pointer events can have subtle ordering quirks; validate by dragging the divider in both Chromium and Firefox before merging.
