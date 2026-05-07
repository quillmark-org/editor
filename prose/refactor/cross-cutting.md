# Cross-Cutting Themes

Several findings in the per-area docs are symptoms of a small number of underlying structural issues. Fixing one root cause retires three to five findings at once. This doc names the roots.

---

## 1. Overlay and modal coordination is fragmented

**Findings unified:** [state-and-stores § M2](./ui/state-and-stores.md#m2), [state-and-stores § L1-L3](./ui/state-and-stores.md#l1), [components § M5](./ui/components.md#m5), [components § M7](./ui/components.md#m7), [components § L4](./ui/components.md#l4).

Three stores coordinate overlays with three different shapes:

- `overlayStore` — low-level priority stack (registered by `base-dialog`, `base-popover`).
- `editorModalCommandsStore` — discriminated-union event queue for editor modals (+ `token` dedup hack).
- `loginModalStore` — imperative facade that knows about `publish | share | star` actions.

Meanwhile, custom overlays (`RulerOverlay`, `TableControls`, `SelectionToolbar`) don't register with any of them and reimplement Escape/click-outside ad hoc.

**Root fix:**
1. One `src/lib/stores/modals.svelte.ts` exposing named modals keyed by string. Each value is `{ open, onClose, payload? }`.
2. Rebuild `editorModalCommandsStore` as `modalsStore.editor` (namespace getter).
3. Rebuild `loginModalStore` as `modalsStore.login` taking a `continuation` callback rather than a discriminant action.
4. Route custom overlays through `overlayStore` so Escape + focus restore are consistent. Either migrate them, or accept that portal overlays aren't "modals" and give them their own lightweight coordination — but pick one story.

**Retires:** 3 stores, ~10 component-level M-severity findings, the `token` state in `DocumentEditor`, and half the Escape-handler duplication.

---

## 2. Dark mode and other global settings have no home

**Findings unified:** [components § M4](./ui/components.md#m4), [components § M6](./ui/components.md#m6), [components § H2](./ui/components.md#h2) (storage dispatch), [routes § M1](./ui/routes-and-layout.md#m1) (session monitor).

Today `dark-mode`, `editor-mode`, `ruler-visible`, and similar are stored in localStorage and each consumer reads/writes independently. `DocumentEditor.svelte:372-390` manually dispatches a `storage` event so `Sidebar.svelte:75-89` can observe the same write. Meanwhile `Preview.svelte:293-302` and `Sidebar.svelte:92-97` both own `MutationObserver`s on `document.documentElement` to track dark-mode changes.

**Root fix:**

A single `src/lib/stores/settings.svelte.ts` exposing:

```ts
settingsStore.darkMode         // $state-backed, persisted to localStorage
settingsStore.editorMode
settingsStore.rulerVisible
settingsStore.toggleDarkMode()
```

All consumers subscribe. The store owns persistence + the single `MutationObserver` for bootstrapping from the SSR-rendered class. `storage` event dispatch from application code goes away.

**Retires:** ~4 findings; eliminates one whole category of effect in `DocumentEditor`.

---

## 3. `DocumentStore` is doing work that belongs at the page feature boundary

**Findings unified:** [state-and-stores § H1](./ui/state-and-stores.md#h1), [state-and-stores § H2](./ui/state-and-stores.md#h2), [components § H2](./ui/components.md#h2).

The 882-LOC `documentStore` is a god not because of poor code hygiene inside it, but because the page-level orchestration (bootstrap, auto-select, session recovery, content loading, active selection, optimistic mutations) is all living in the shared store. The `DocumentEditor` component then adds its own mutation choreography on top — `previousLoadedId` tracking, stale-closure hotkeys, modal command tokens.

**Root fix:** Separate the **repository** (data access, CRUD, caching) from the **session** (who's loaded, active id) from the **page** (editor-specific coordination). Concretely:

```
src/lib/stores/documents/
  collection.svelte.ts       — cloud/local list, CRUD, optimistic updates
  loader.svelte.ts           — loadedDocument, fetch-on-select
  session.svelte.ts          — bootstrap + auto-select
  ui.svelte.ts               — collapse, lastActive, unsaved flag
  index.ts                   — re-exports bound namespace

src/lib/features/editor-page/
  editor-page.svelte.ts      — the "currently-editing" coordinator; consumes the stores, exposes single selectDocument()
```

`DocumentEditor` then reads `editorPage.current` instead of juggling `documentStore.loadedDocument + previousLoadedId`. The dual `setActiveDocumentId` / `selectDocument` API collapses to one `editorPage.select(id)` method.

**Retires:** 3 H-severity findings and unblocks the [`document-editor-state-density`](../proposals/simplifications/document-editor-state-density.md) proposal.

---

## 4. `editorState.svelte.ts` mixes the parse-time pipeline with the live state

**Findings unified:** [editor-substrate § H1, M1, M3, M5](./ui/editor-substrate.md).

Parsing, serialization, and live mutations share one module because they share types. They don't need to share a file. The "state" part is ~200 LOC of reactive class; the parse/serialize is ~500 LOC of pure functions. Separating them:

- Makes the mutation invariants (the `editorState.svelte.ts:468` remediation, the YAML key reordering) legible.
- Kills the 3× `as any` casts for YAML AST writes.
- Removes the accidental re-exports of `$lib/parsing` types.
- Makes `rebuildBlocksFromState` reusable from a testing harness without instantiating the reactive class.

See [editor-substrate § H1](./ui/editor-substrate.md#h1) for the file layout proposal.

---

## 5. Component inventory has a lot of one-use "base" / sibling primitives 🟡 PARTIALLY RESOLVED (2026-04-22)

**Findings unified:** [components § L1, L2, L5](./ui/components.md#l1), [primitives § H1, M1, L3](./ui/primitives.md#h1).

- ~~`dialog-content.svelte` (0 callers), `base-sheet.svelte` (0 callers).~~ ✅ Deleted (`4065fa6`).
- `AddCardTrigger.svelte`, `CardTypeSelector.svelte` (1 caller each).
- `resizable-split.svelte.ts` (1 caller) — fine as long as it stays file-local.
- ~~Per-folder `index.ts` barrels that re-export one component each.~~ ✅ Deleted 5 of them (`fc90ed6`); 5 multi-export barrels preserved.
- `inline-editable-title.svelte` living in `ui/` while depending on `services/documents`.

Pattern: when an abstraction is one level of indirection without a second consumer, inline it. The project's discipline around empty `utils/index.ts` shows the taste exists — extend it to components.

**Rule of thumb to adopt:**
- 0 consumers ⇒ delete (let git remember).
- 1 consumer ⇒ keep only if the split sharpens the consumer (e.g., state machine class). Don't create new barrels or re-exports for it.
- 2+ consumers ⇒ primitive earns its place.

**Remaining work:** single-caller inlining (`AddCardTrigger`, `CardTypeSelector`) and the `inline-editable-title` domain-coupling move.

---

## 6. Accessibility is inconsistent between primitives and hand-rolled overlays

**Findings unified:** [components § M7](./ui/components.md#m7), [primitives § M5, M6](./ui/primitives.md#m5).

`base-dialog` nails focus trap + Escape + aria labelling. `RulerOverlay` hand-rolls Escape. `TableControls` has neither. `tooltip` and `base-popover` ship without full WAI-ARIA association between trigger and content.

**Root fix:** Adopt an `<OverlaySurface>` primitive that the custom overlays wrap — it owns portal + `use-dismissible` + optional focus management, but does no styling. `RulerOverlay.svelte` and `TableControls.svelte` keep their visual chrome and hand off accessibility to the shared surface. Tooltip / Popover each get a focused a11y pass (these are simple 3-4 line additions, not architectural work).

---

## Ordering suggestion for a refactor campaign

Top-down, so one PR doesn't collide with the next:

1. **Root #5** — delete dead primitives and single-use barrels. Near-zero risk; reduces noise for all subsequent work. 🟡 Dead primitives (`dialog-content`, `base-sheet`) and single-export barrels landed 2026-04-22; single-caller inlining remains.
2. **Root #1** — unify modal/overlay coordination. High leverage; unblocks component-level simplifications.
3. **Root #2** — settings store. Depends on #1 for overlay cleanup in `Sidebar`; otherwise independent.
4. **Root #4** — split `editorState.svelte.ts`. Independent of the above; can proceed in parallel.
5. **Root #3** — decompose `documentStore` + extract `editor-page` feature. Largest diff; ideally sits on top of #1-#2 so the modal/settings churn doesn't pollute the review.
6. **Root #6** — a11y pass. Small PRs, after the modal unification settles.
7. Per-area tidy-ups: CSS duplication ([routes § M3-M4](./ui/routes-and-layout.md#m3)), lucide migration ([primitives § M4](./ui/primitives.md#m4)), RAF → ResizeObserver in TableControls ([components § M3](./ui/components.md#m3)).
