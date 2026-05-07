# State & Stores Audit

Findings in `src/lib/stores/**`, `src/lib/features/editor-page/**`, and the Svelte 5 reactive classes in `src/lib/utils/*.svelte.ts`.

See also: [`prose/designs/STATE_PATTERNS.md`](../../designs/STATE_PATTERNS.md) for the intended convention and [`prose/designs/OVERLAY_SYSTEM.md`](../../designs/OVERLAY_SYSTEM.md) for overlay coordination.

---

## H1. `documents.svelte.ts` — 882-LOC god store

**File:** `src/lib/stores/documents.svelte.ts:1-882`

Five concerns are tangled in one class:

1. **Collection state** — cloud + local lists, filtering, `_activeDocumentId`, `_activeSource`.
2. **Optimistic mutations** — create / update / delete / setPublic / duplicate / promoteLocal each include rollback logic in-line.
3. **Content loading** — `loadedDocument`, `isLoadingContent`, fetch-on-select.
4. **Session bootstrap** — `initializeCloudDocuments`, `fetchLocalDocuments`, `fetchGuestDocuments`, `autoSelectDocument` each touch different cross-cutting state.
5. **UI state** — `hasUnsavedChanges`, group collapse, `lastActiveDocumentId` persistence.

Evidence: 8 separate `$state` fields (`documents.svelte.ts:62-85`), 19 getters (`documents.svelte.ts:92-189`) presenting derived views (none are `$derived`), an internal `DocumentRepository` (`documents.svelte.ts:38-42`) with a closure-captured callback.

**Suggested split:**
- `DocumentCollectionStore` — CRUD + active selection.
- `DocumentLoaderStore` — `loadedDocument`, fetch-on-select.
- `DocumentSessionStore` — bootstrap (cloud/local/guest), auto-select.
- `DocumentUIStore` — collapse, last-active, unsaved flag.

All four can live in `src/lib/stores/documents/` behind one re-exported namespace so call sites migrate incrementally.

---

## H2. Dual active-selection API inside `documents.svelte.ts`

**File:** `src/lib/stores/documents.svelte.ts:204-224` (`setActiveDocumentId`) vs `257-341` (`selectDocument`).

Both mutate `_activeDocumentId` + `_activeSource`. `selectDocument` additionally loads content and saves the previous document. Callers use `selectDocument` more or less universally but `setActiveDocumentId` is still public and called from four sites (`documents.svelte.ts:281, 504, 518, 637`).

This is the shape smell that also forces `DocumentEditor.svelte:225-255` to manually track `previousLoadedId` to decide if a "real" selection change happened.

**Suggested fix:** Make `setActiveDocumentId` private (`_updateActiveSelection`). `selectDocument` becomes the only public entry point; it short-circuits when the id doesn't change. The tracking effect in `DocumentEditor` then goes away.

---

## M1. `responsive.svelte.ts` — event listeners that leak on destroy

**File:** `src/lib/stores/responsive.svelte.ts:~60-95`

```ts
initialize() {
  window.addEventListener('resize', this.checkNarrowViewport);
  ...
}
destroy() {
  window.removeEventListener('resize', this.checkNarrowViewport);
  ...
}
```

`checkNarrowViewport` etc. are defined as methods on the class, so each read of `this.checkNarrowViewport` is the *same* reference only if accessed through the same instance — but if the methods are defined as `checkNarrowViewport() { … }` (not `= () => {}`), the `removeEventListener` won't actually match because no explicit bind happened. Audit and fix by switching to arrow-function class fields:

```ts
private checkNarrowViewport = () => { … };
```

Add a unit test that `initialize()` followed by `destroy()` restores `window`'s listener count to baseline.

---

## M2. Three modal-coordination stores doing one job

**Files:**
- `src/lib/stores/login-modal.svelte.ts` (31 LOC)
- `src/lib/stores/editor-modal-commands.svelte.ts` (22 LOC)
- `src/lib/stores/overlay.svelte.ts` (131 LOC)

Three different APIs, one concept:

| Store | Shape | Callers |
|---|---|---|
| `loginModalStore` | `.show(action, options?)`, `.hide()`, `.isOpen` | `Sidebar`, `DocumentList`, `FeatureLoginModal` |
| `editorModalCommandsStore` | `.openModal(key)`, `.closeAll()`, `token` counter | `DocumentEditor`, individual editor modals |
| `overlayStore` | `.register(id, type, onClose)` with priority stacking | `base-dialog`, `base-popover`, hotkey Escape handler |

The token counter on `editorModalCommandsStore` (see [`components.md § H2`](./components.md#h2)) exists because the store fires "open this modal" as an event; the DocumentEditor has to dedupe via `command.token`. The shape should be state (`openModal: 'share' | 'info' | null`), not events.

**Suggested fix:** One `modalsStore.svelte.ts` with a registry-of-registries: `modalsStore.overlays` is the low-level priority stack (current `overlayStore`); `modalsStore.login` and `modalsStore.editor` are named facades that still coordinate through the stack. See [cross-cutting § 1](../cross-cutting.md#1-overlay-and-modal-coordination).

---

## M3. `ruler.svelte.ts` reaches into `responsive.svelte.ts` internals

**File:** `src/lib/stores/ruler.svelte.ts:17-26`

```ts
setActive(active: boolean) {
  if (active && responsiveStore.isTouchDevice) return;
  state.set(active);
}
```

The ruler store knows about the responsive store's private policy. If the touch-detection heuristic changes, the ruler behavior changes invisibly.

**Suggested fix:** Either (a) expose `responsiveStore.canShowRuler` as a named derived getter on the responsive store, or (b) move the gate to `RulerOverlay.svelte` where the decision is view-level and can co-exist with other responsive gates.

---

## M4. `CollectionStore` feature flags never read

**File:** `src/lib/stores/factories.svelte.ts` + `src/lib/stores/documents.svelte.ts:45-59`

Cloud and local collections are instantiated with `withLoading: true/false` and `withError: true/false`, but `documents.svelte.ts` has its own `_isLoading` / `_error` fields (`documents.svelte.ts:64-65`) and never reads the per-collection flags.

**Suggested fix:** Drop the unread flags at instantiation. If the factory's loading/error affordances are only used by stores that wrap them, consider removing them from the factory and keeping it minimal; the wrapping stores can add loading state in one place.

---

## M5. `editorState.svelte.ts` mixes parsing, serialization, and mutations

**File:** `src/lib/editor/editorState.svelte.ts:1-731`

Covered in detail under [`editor-substrate.md § H1`](./editor-substrate.md#h1). Listed here because `editorState` is the largest non-document-store reactive class and logically belongs to the state layer.

---

## M6. `auto-save.svelte.ts` — unmount race on in-flight save

**File:** `src/lib/utils/auto-save.svelte.ts` (approx.)

```ts
async saveNow(id, content) {
  this.state.status = 'saving';
  try { await documentStore.saveDocument(id, content); this.state.status = 'saved'; }
  catch (err) { this.state.status = 'error'; ... }
}
```

Plus a timeout that clears the `'saved'` status after some delay. If the owning component unmounts during an in-flight save, the post-await mutation fires into a destroyed instance and the timeout fires into nothing.

**Suggested fix:** Add a `destroy()` method (or use `$effect` return cleanup) that clears timers and sets a `destroyed` flag; short-circuit the post-await writes if `destroyed`.

---

## L1. `editor-modal-commands.svelte.ts` — 22 LOC, 3 callers, entire reason for the `token` hack

Mentioned in M2 above. Strong candidate for the first deletion once the unified modals store lands.

---

## L2. `login-modal.svelte.ts` — 31 LOC, 3 callers, knows about `'publish' | 'share' | 'star'` actions

**File:** `src/lib/stores/login-modal.svelte.ts`

A UI store encoding business actions (publish/share/star) as string literals means every time a new "feature requires login" gate is added you edit the store. Pass the post-login continuation as a callback and let the store be action-agnostic:

```ts
loginModalStore.show({ onSignedIn: () => doPublish() });
```

---

## L3. `overlay.svelte.ts` — priority stacking used only by two callers

**File:** `src/lib/stores/overlay.svelte.ts`

Registry + priority stack + Escape dispatch is a well-designed pattern, but only two overlays (dialog, popover) currently register. If the intent was to also cover `RulerOverlay` / `TableControls` / `SelectionToolbar`, they should be migrated (see [`components.md § M7`](./components.md#m7)). If not, the priority concept is speculative — reduce to a simple "top of stack gets Escape" list until a third consumer appears.

---

## L4. `responsive.svelte.ts` touch/narrow/portrait as three separate fields

**File:** `src/lib/stores/responsive.svelte.ts`

Every consumer reads one of `isTouchDevice`, `isNarrow`, `isPortrait`, `isMobileLayout`. There are overlapping helpers (`isMobileLayout` is effectively `isNarrow || isPortrait`). Worth a once-over to dedupe the derived flags and make clear which callers actually need the primitive signal versus the composite.

---

## Summary table

| ID | Severity | File | One-line |
|---|---|---|---|
| H1 | H | `documents.svelte.ts` | Split 882-LOC store by concern |
| H2 | H | `documents.svelte.ts` | Retire dual `setActiveDocumentId` / `selectDocument` |
| M1 | M | `responsive.svelte.ts` | Fix event-listener cleanup (arrow methods) |
| M2 | M | three modal stores | Unify into one `modalsStore` |
| M3 | M | `ruler.svelte.ts` | Decouple from responsive-store internals |
| M4 | M | `factories.svelte.ts` | Drop unused `withLoading`/`withError` flags |
| M5 | M | `editorState.svelte.ts` | Split parse/serialize/mutate (see editor doc) |
| M6 | M | `auto-save.svelte.ts` | Cancel on destroy |
| L1 | L | `editor-modal-commands.svelte.ts` | Delete after unification |
| L2 | L | `login-modal.svelte.ts` | Action-agnostic; take callback |
| L3 | L | `overlay.svelte.ts` | Priority premature until 3rd consumer |
| L4 | L | `responsive.svelte.ts` | Consolidate overlapping flags |
