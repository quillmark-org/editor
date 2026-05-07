# Components Audit

Findings in `src/lib/components/**` (excluding the `ui/` primitive layer, which has its own doc). Ordered by severity.

---

## H1. `NewDocumentModal.svelte` — 1,834-line god component

**File:** `src/lib/components/NewDocumentModal/NewDocumentModal.svelte:1-1834`

The largest file in the UI tree, and it does far too much. In one component:

- Template manifest fetch + cache
- Search, filter, sort, pagination, "starred" and "recents" sub-lists
- Gallery thumbnail rendering (SVG generation, cache, invalidation)
- Template detail fetch on hover/selection
- Mobile step wizard (list → detail → create form)
- Form state, validation, submission, error rendering
- Navigation into `/doc/[id]` on success

**Symptoms:**
- Hard-coded constants inline (`NewDocumentModal.svelte:119-125` — `HOME_SECTION_MAX_ITEMS` etc.).
- At least four independent pieces of state tracking the "current selection" (list, detail, gallery, mobile step).
- Logic for "what to show on the home tab" is repeated in three places (starred section, recents section, official templates section).

**Suggested fix:** Split into a folder of cohesive children:
- `TemplateGallery.svelte` (thumbnail grid + scroll behavior)
- `TemplateSearch.svelte` (search + filter chips)
- `TemplateDetail.svelte` (right-pane preview + metadata)
- `CreateDocumentForm.svelte` (form + submit)
- a `new-document.svelte.ts` store owning template list / detail cache / selection

Keep `NewDocumentModal.svelte` as ~200 lines of layout + wiring only. Caching should move to the store so the modal can unmount without discarding the fetched manifest.

---

## H2. `DocumentEditor.svelte` — state density and effect sprawl

**File:** `src/lib/components/Editor/DocumentEditor.svelte:1-673`

~16 `$state` fields covering four unrelated concerns (modals, split pane, editor plumbing, preview status). Five overlapping `$effect`s at lines 152-181, 204-221, 225-255, 282-292, 372-390.

Already has a dedicated proposal: see [`prose/proposals/simplifications/document-editor-state-density.md`](../../proposals/simplifications/document-editor-state-density.md).

**Additional findings not yet in that proposal:**

1. **Stale closure in `useHotkey`** — `DocumentEditor.svelte:60-69`. `handleManualSave` closes over `content` and `documentId` but is registered once; after a document switch the hotkey saves stale data unless a re-register effect is added.
2. **Token-based modal command dispatch** — `DocumentEditor.svelte:307-329`. A numeric `command.token` deduplicates bursts from `editorModalCommandsStore`. This mechanism is opaque and exists because the store is shaped wrong (see [`state-and-stores.md § M3`](./state-and-stores.md)). Fix the store; delete the token dance.
3. **Manual `StorageEvent` dispatch** — `DocumentEditor.svelte:381-389`. Manually synthesizes a `storage` event so `Sidebar.svelte:75-89` can observe a localStorage write. Both sides should read from a single settings store.

**Severity:** H (density), M (the three above).

---

## M1. `BodyEditor.svelte` — duplicated utilities inline

**File:** `src/lib/components/Editor/BodyEditor.svelte:1-550`

- **Duplicate debounce.** `BodyEditor.svelte:220-227` reimplements the same debounce pattern used in `DocumentEditor.svelte:266-268`. Extract to `src/lib/utils/debounce.ts`.
- **Duplicate table detection.** `BodyEditor.svelte:232-245` hand-rolls "is cursor in a table?" logic that ProseMirror utilities can provide. Share with `TableControls.svelte`.
- **Placeholder via `data-*` + CSS `attr()`.** `BodyEditor.svelte:323` uses `data-placeholder` + `::before { content: attr(...) }`. Works today, but replacing with a rendered `<span>` gated by an `isEmpty = $derived(…)` check is simpler and testable.

---

## M2. `Preview.svelte` — tangled render lifecycle

**File:** `src/lib/components/Preview/Preview.svelte:1-635`

Five concerns in one file: format selection, PDF URL lifecycle (create/revoke blob URLs), SVG page processing, loading timers, dark-mode detection, comfort-mode state, error overlay.

Concrete extractions:
- **Error overlay** — `Preview.svelte:373-462` is a self-contained block worth its own component (`PreviewErrorOverlay.svelte`). It does error shape discrimination, line extraction from the message, and rendering.
- **PDF URL management** — `Preview.svelte:204-231`. The create/revoke pattern belongs in a `.svelte.ts` helper so leaks are impossible to introduce via early `return`.
- **Dark-mode detection** — `Preview.svelte:293-302` duplicates what `Sidebar.svelte:92-97` also does. See [cross-cutting § 2](../cross-cutting.md).

---

## M3. `TableControls.svelte` — continuous RAF and portal accessibility

**File:** `src/lib/components/Editor/TableControls.svelte:1-510`

- `TableControls.svelte:85-93` measures table rects every animation frame even when nothing changed. A `ResizeObserver` on the table element plus `scroll` listeners on its ancestors would do the same work only when state actually changes.
- Rendered via `<Portal>`; lacks the Escape-to-dismiss handler that `RulerOverlay.svelte:149` has. Inconsistency is jarring and reduces keyboard usability.
- Drag-handler factory `TableControls.svelte:241-321` is a clear `useDrag(...)` composable candidate — it will also pay off in `resizable-split.svelte.ts` and `RulerOverlay.svelte`.

---

## M4. `Sidebar.svelte` — `bind:open` on popovers and localStorage reads

**File:** `src/lib/components/Sidebar/Sidebar.svelte:1-~500`

- `Sidebar.svelte:253, 270, 302` use `bind:open={popoverOpen}` with `BasePopover`. The rest of the app uses the one-way `open={…} onOpenChange={…}` pattern (e.g. `DocumentEditor.svelte:562-587`). Standardize on callbacks — `bind:` re-enters an implicit two-way contract that makes refactors harder.
- `Sidebar.svelte:75-89` reads `editor-mode` and `theme` from localStorage, observes `storage` events. The same keys are written by `DocumentEditor.svelte:372-390`. The absent abstraction is a `settingsStore` — see [cross-cutting § 3](../cross-cutting.md).

---

## M5. Modal open/close boilerplate is copy-pasted

**Files:**
- `DocumentEditor.svelte:562-587` — 4 `open` / `onOpenChange` pairs
- `ImportFileDialog.svelte:65`, `PromoteToPublishModal.svelte:41`, `ShareModal.svelte:78`, `BetaFeedbackModal.svelte`, `BetaRecruitmentModal.svelte`, `DocumentInfoDialog.svelte`, `FeatureLoginModal.svelte`, `KeyboardShortcutsModal.svelte`, `TemplatePublishModal/TemplatePublishModal.svelte`

Every dialog parent ships the same two-prop ceremony, and `DocumentEditor` tracks 4 such flags as a discriminated union (already captured in the `DocumentEditor` state density proposal).

**Suggested fix:** Merge with the store-layer finding in [`state-and-stores.md § M3`](./state-and-stores.md#m3): a single `modalsStore` keyed by modal name. Dialogs then subscribe directly and parents don't pass `open` at all — they just imperatively call `modalsStore.open('share')`.

---

## M6. Dark-mode detection duplicated

**Files:** `Preview.svelte:293-302`, `Sidebar.svelte:92-97`, CSS-level class checks in several others.

Every component that needs to know dark-mode state independently attaches a `MutationObserver` to `document.documentElement`. Extract `useDarkMode()` in `src/lib/utils/` or add a `theme` field on a centralized settings store (see cross-cutting themes).

---

## M7. Focus / Escape / click-outside inconsistency across overlays

| Overlay | Escape | Click-outside | Focus trap |
|---|---|---|---|
| `base-dialog.svelte` | yes (`useDismissible`) | yes | yes |
| `RulerOverlay.svelte:149` | yes (hand-rolled) | yes (hand-rolled) | no |
| `TableControls.svelte` | **no** | no | no |
| `SelectionToolbar.svelte` | no | no | no (probably correct) |

The three primitives in `ui/` already share hooks (`use-dismissible`, `use-focus-trap`); the custom overlays in `components/` don't. Route the non-primitive overlays through the same hooks — portal-rendered overlays especially.

---

## L1. `resizable-split.svelte.ts` — single-caller helper class

**File:** `src/lib/components/Editor/resizable-split.svelte.ts`

Used exactly once (in `DocumentEditor.svelte`). The extraction proposal in `document-editor-state-density.md § 2` still calls for this shape, but we should **not** make its API public — keep it as a file-local helper rather than a "component library resizable". Flagged only so a future reviewer doesn't promote it.

---

## L2. `AddCardTrigger.svelte` + `CardTypeSelector.svelte` vs `VisualEditor.svelte`

**Files:** `Editor/AddCardTrigger.svelte` (1.5KB), `Editor/CardTypeSelector.svelte` (1.0KB), `Editor/VisualEditor.svelte`.

Both tiny components exist for a single caller (`VisualEditor.svelte`). Worth inlining unless they're on a near-term roadmap to be reused — component files carry boilerplate overhead per file.

---

## L3. Inline Tailwind stripes in toolbars

**Files:** `SelectionToolbar.svelte`, `TableControls.svelte`, `RulerOverlay.svelte`.

The class strings `text-muted-foreground hover:text-foreground h-6 w-6 …` repeat across three overlays. Extract to a `.toolbar-icon-button` class in `app.css` (or a `<ToolbarIconButton>` primitive) — this is the same repetition that `ToolbarButton.svelte` was created to solve but isn't used by the hand-rolled overlays.

---

## L4. `BetaFeedbackModal`, `BetaRecruitmentModal`, `PromoteToPublishModal`, `ShareModal` — same modal skeleton

These four modals (each 2-10KB) each do header + body + submit + error display + `open`/`onOpenChange`. After the dialog-content primitive is either fixed or removed (see [`primitives.md § M1`](./primitives.md)), these modals should share the same 6-7 line skeleton rather than each defining it.

---

## L5. `index.ts` barrel files mostly re-export a single component ✅ RESOLVED (`fc90ed6`, 2026-04-22)

Every `components/<Folder>/index.ts` re-exports exactly the one component next to it (`DocumentList`, `DocumentTeaser`, `Preview`, `RulerOverlay`, `TemplatePublishModal`, `TopMenu`, etc.). The indirection has no benefit, extends IDE autoimport suggestions, and each file is 40-100 bytes of noise. Delete the barrels; import `'$lib/components/Preview/Preview.svelte'` directly. (Only keep barrels where >1 public export needs grouping, e.g. `Editor/index.ts` which re-exports multiple toolbar pieces.)

**Resolution:** Deleted 5 single-export barrels (`DocumentTeaser`, `NewDocumentModal`, `Preview`, `RulerOverlay`, `TemplatePublishModal`); rewrote 6 import sites. Preserved 5 multi-export barrels: `Editor` (10 exports), `TopMenu` (4), `Sidebar` (4), `Wizard` (3), `DocumentList` (2). Note: the audit named `DocumentList` and `TopMenu` as single-export candidates — on inspection each actually has ≥2 exports today and was correctly preserved.

---

## Summary table

| ID | Severity | File | One-line | Status |
|---|---|---|---|---|
| H1 | H | `NewDocumentModal.svelte` | Split 1834-line god component | |
| H2 | H | `DocumentEditor.svelte` | State density + effect sprawl (existing proposal) | |
| M1 | M | `BodyEditor.svelte` | Duplicate debounce + table detection | |
| M2 | M | `Preview.svelte` | Extract error overlay, PDF URL lifecycle | |
| M3 | M | `TableControls.svelte` | RAF polling; no Escape on portal | |
| M4 | M | `Sidebar.svelte` | `bind:open` + localStorage duplication | |
| M5 | M | modals × 10 | Shared open/close ceremony → modalsStore | |
| M6 | M | `Preview` / `Sidebar` | `useDarkMode()` composable | |
| M7 | M | overlays | Route all overlays through `use-dismissible` | |
| L1 | L | `resizable-split.svelte.ts` | Keep file-local | |
| L2 | L | Editor/AddCard* | Consider inlining | |
| L3 | L | toolbars | Extract `.toolbar-icon-button` | |
| L4 | L | four small modals | Share modal skeleton | |
| L5 | L | `index.ts` barrels | Delete single-export barrels | ✅ `fc90ed6` |
