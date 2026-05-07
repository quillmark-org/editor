# UI Primitives, Utils & Icons Audit

Findings in `src/lib/components/ui/**`, `src/lib/utils/**`, `src/lib/icons/**`, and `src/lib/errors/utils.ts`.

---

## H1. `dialog-content.svelte` — dead primitive ✅ RESOLVED (`4065fa6`, 2026-04-22)

**File:** `src/lib/components/ui/dialog-content.svelte:1-34`

Zero importers in the codebase. It's a pure styling wrapper (children snippet + a `prose` flag + a `fullscreen` flag). Likely an early stub that got superseded by inline content inside each dialog consumer.

**Suggested fix:** Delete the file. If the `prose` / `fullscreen` layout needs to be shared, reincarnate as a class on `base-dialog`.

**Resolution:** File deleted. A remaining `dialog-content` CSS class-name string inside `base-dialog.svelte:196` is unrelated (styling selector, not an import).

---

## H2. `BaseSelect` generics widened to `any` ✅ RESOLVED (`2a97366`, 2026-04-22)

**File:** `src/lib/components/ui/base-select.svelte:76, 136`

```ts
let { items, getItemKey, getItemLabel, ... }: BaseSelectProps<any> = $props();
function handleItemClick(item: any) { … }
```

The generic is declared on the props interface but erased at instantiation. Consumers lose type-checking for `getItemKey` / `getItemLabel` / `onSelect`.

**Suggested fix:** Switch to Svelte 5's generic component syntax:

```svelte
<script lang="ts" generics="T">
  let { items, getItemKey, ... }: BaseSelectProps<T> = $props();
  function handleItemClick(item: T) { ... }
</script>
```

**Resolution:** Applied the `generics="T"` script attribute; threaded `T` through the props destructure and `handleItemClick`. `clearable` path uses `undefined as T` casts to preserve runtime behavior; the "no selection" contract (`value: T | null | undefined` at `BaseSelect`) remains under-typed and should be tightened in a follow-up. Bonus find: `CardTypeSelector` was silently passing `string | null` into `BaseSelect<string>` — fixed at the call site.

---

## M1. `base-sheet.svelte` — 192 LOC, zero consumers ✅ RESOLVED (`4065fa6`, 2026-04-22)

**File:** `src/lib/components/ui/base-sheet.svelte`

Full-featured slide-in sheet, shares hooks with `base-dialog`. Grep finds no importers.

**Suggested fix:** Either (a) delete and re-add when a caller appears — keep the git history — or (b) if there's a known use case (mobile side drawer?), leave a `// Intended use: …` comment at the top so it doesn't get deleted by the next cleanup.

---

## M2. `base-dialog.svelte` — 16 props, seven size variants

**File:** `src/lib/components/ui/base-dialog.svelte:10-74`

Props: `open, onOpenChange, title, description, closeOnEscape, closeOnOutsideClick, hideCloseButton, scoped, elevated, size ('sm'|'md'|'lg'|'xl'|'full'|'fullscreen'|'panel'), class, headerClass, content, header, footer, onSubmit, restoreFocus, initialFocusSelector`.

Only `size='panel'` has custom CSS at `base-dialog.svelte:214-220`; `scoped` vs `elevated` vs default creates three z-index strategies (`base-dialog.svelte:68-73, 91-94`).

**Suggested fix:**
- Audit actual consumer sizes; most dialogs use 2-3 values in practice.
- Reduce to `sm | md | lg | fullscreen`. Drop `panel` unless multiple consumers share that width.
- Replace scoped/elevated booleans with a single z-index variable.
- Consider splitting into `<Dialog>` + `<DialogHeader>` / `<DialogBody>` / `<DialogFooter>` snippets; consumers compose instead of passing 3 snippet props.

---

## M3. Random-`Math.random()` IDs across primitives ✅ RESOLVED (`fd77270`, 2026-04-22)

**Files:**
- `src/lib/components/ui/base-dialog.svelte:76`
- `src/lib/components/ui/base-sheet.svelte:43`
- `src/lib/components/ui/base-popover.svelte:85`
- `src/lib/components/ui/tooltip.svelte` (generates own)

All four use `Math.random().toString(36).substring(7)`. Meanwhile `src/lib/utils/unique-id.ts` exists and prefers `crypto.randomUUID()` when available.

**Suggested fix:** `import { generateUniqueId } from '$lib/utils/unique-id'` in each. One line each.

**Resolution:** Swapped in `base-dialog.svelte` and `base-popover.svelte`. `base-sheet.svelte` was deleted by §M1. `tooltip.svelte` turned out to generate no DOM id at all — audit note was imprecise; no change made.

---

## M4. `custom-icons.ts` bakes stroke colors into SVG strings

**File:** `src/lib/icons/custom-icons.ts:1-73`

```ts
export const DownloadPdfIconSvg = `...stroke="#F40F02"...`;      // brand red
export const DownloadMarkdownIconSvg = `...stroke="#083FA1"...`; // brand blue
```

Colors ship in the SVG source instead of inheriting via `stroke="currentColor"`. Breaks theme switching and hover states.

Additionally the `providerIconMap` has collisions ("key" is the fallback for three provider names), and consumption is via `{@html …}` (`download-button.svelte:85-86`) which is inconsistent with the rest of the codebase using lucide-svelte components.

**Suggested fix:**
- Swap stroke colors for `currentColor`; apply the brand color from the parent class.
- Port the 6 custom icons to `.svelte` files (or better, lucide where equivalents exist) so `<Icon />` replaces `{@html Svg}`.
- Fix the `providerIconMap` fallback collisions or document them.

---

## M5. Tooltip accessibility gaps

**File:** `src/lib/components/ui/tooltip.svelte:~170-180`

- Renders `role="tooltip"` but the trigger has `role="presentation"` and no `aria-describedby` linking to the tooltip.
- Tooltip element is rendered conditionally; should be present with `aria-hidden="true"` + displayed/hidden via CSS to support screen readers that skip dynamic insertion.

**Suggested fix:** Standard WAI-ARIA tooltip pattern:
```svelte
<div
  bind:this={triggerRef}
  aria-describedby={visible ? tooltipId : undefined}
>
  {@render children()}
</div>
{#if visible}
  <div id={tooltipId} role="tooltip">{content}</div>
{/if}
```

---

## M6. `base-popover` trigger missing `aria-expanded` / `aria-controls`

**File:** `src/lib/components/ui/base-popover.svelte:170-171`

The popover element uses `role="dialog"` + conditional `aria-labelledby`; the trigger element has no `aria-expanded` state and no `aria-controls` linking to the popover id. Screen readers announce the trigger as an un-linked button.

**Suggested fix:**

```svelte
<div bind:this={triggerRef}
     aria-haspopup="dialog"
     aria-expanded={open}
     aria-controls={popoverId}>
```

---

## L1. `confirm-dialog.svelte` — legitimate specialization

**File:** `src/lib/components/ui/confirm-dialog.svelte`

One consumer. Wraps `base-dialog` with confirm/cancel buttons and destructive variant. This is the right level of abstraction — keep.

---

## L2. `svg-preview-pane.svelte` — not audited in depth

Flagged only so a future pass covers it. 1.5KB file, appears to render untrusted SVG; worth a security pass separate from maintainability.

---

## L3. `inline-editable-title.svelte` is document-domain-aware

**File:** `src/lib/components/ui/inline-editable-title.svelte:1-117`

Imports `DEFAULT_DOCUMENT_NAME` from `$lib/utils/document-naming` and `DocumentValidator` from `$lib/services/documents/document-validator`. The file lives under `ui/` but reaches into `services/` — the directory implies it's a reusable primitive, the code says it's document-specific.

**Suggested fix:** Move to `src/lib/components/Editor/` or `src/lib/components/DocumentList/`, or make the defaults and validator injectable props so `ui/inline-editable-title.svelte` can live up to its directory.

---

## L4. `toast.svelte` primitive vs `toastStore` (15 callers)

**File:** `src/lib/components/ui/toast.svelte`, `src/lib/stores/toast.svelte.ts`

Well-designed; aria-live container + icon dispatch by severity. Fifteen callers — one of the most reused primitives. No action. Flagged as a healthy baseline to imitate.

---

## L5. `src/lib/utils/index.ts` is intentionally empty

File ships a comment: "Use specific utility imports like $lib/utils/cn or $lib/utils/focus-trap." Good discipline. No action.

---

## Summary table

| ID | Severity | File | One-line | Status |
|---|---|---|---|---|
| H1 | H | `dialog-content.svelte` | Delete unused primitive | ✅ `4065fa6` |
| H2 | H | `base-select.svelte` | Use Svelte 5 generics properly | ✅ `2a97366` |
| M1 | M | `base-sheet.svelte` | Delete-or-document 192-LOC unused sheet | ✅ `4065fa6` |
| M2 | M | `base-dialog.svelte` | Trim 16 props / 7 sizes / 3 z-index modes | |
| M3 | M | 4× primitives | Switch to `generateUniqueId()` | ✅ `fd77270` |
| M4 | M | `custom-icons.ts` | `currentColor` + migrate to components | |
| M5 | M | `tooltip.svelte` | Add `aria-describedby` link | |
| M6 | M | `base-popover.svelte` | Add `aria-expanded` / `aria-controls` on trigger | |
| L1 | L | `confirm-dialog.svelte` | Keep | |
| L2 | L | `svg-preview-pane.svelte` | Out of scope; flag for security pass | |
| L3 | L | `inline-editable-title.svelte` | Move out of `ui/` or decouple | |
| L4 | L | `toast.svelte` | Keep (reference pattern) | |
| L5 | L | `utils/index.ts` | Keep | |
