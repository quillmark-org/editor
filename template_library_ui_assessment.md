# Template Library UI Assessment

Assessment of NewDocumentModal and TemplatePublishModal against Airmark patterns.

---

## 1. Consistency with Airmark Patterns

### What's working

- **Both modals use `base-dialog.svelte`** correctly — header/content/footer snippets, dismiss guards during async ops, ARIA attributes.
- **Semantic token usage** is strong: `text-foreground`, `text-muted-foreground`, `bg-accent`, `border-border`, `text-destructive` throughout. No raw hex values in templates.
- **Loading/error/empty states** follow the same Loader2 spinner + muted text pattern used across the app.
- **Button variants** (`ghost`, `default`, `outline`, `destructive` styling) match the shared `button.svelte` component API.
- **Icon system** — Lucide icons at consistent sizes (h-4 w-4, h-3 w-3) match other modals (ShareModal, FeatureLoginModal).

### Inconsistencies

| Area                    | Issue                                                                                                                                                                                             | Impact                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dialog sizing**       | Both modals use `:global(.class-name)` with `!important` overrides (7 instances each) to force dimensions — no other modal does this. ShareModal and FeatureLoginModal use `size="sm"` prop.      | Bypasses the dialog size system; fragile if base-dialog changes.                                                                                                                                                               |
| **Sort dropdown**       | NewDocumentModal rolls a custom dropdown (raw `<div>` + `<button>` list) instead of using `BaseSelect`.                                                                                           | Misses keyboard nav, type-ahead, portal-based positioning, and click-outside from BaseSelect. Also has an `a11y_no_static_element_interactions` ignore.                                                                        |
| **Textarea**            | TemplatePublishModal uses a raw `<textarea>` with inline Tailwind classes instead of a shared component. There's no `Textarea` UI primitive.                                                      | Style drift risk; inconsistent focus ring and disabled styling vs. `Input`.                                                                                                                                                    |
| **Footer layout**       | NewDocumentModal footer is a `<form>` with inline label + input + buttons. TemplatePublishModal footer is a `<div>` with buttons. ShareModal footer is a single button. No shared footer pattern. | Not inherently wrong, but the NewDocumentModal footer embedding an input field inside the footer deviates from the header/content/footer separation of concerns. The document name input arguably belongs in the content area. |
| **Confirmation dialog** | TemplatePublishModal uses `window.confirm()` for unpublish. The rest of the app uses styled modals.                                                                                               | Breaks visual consistency and is not themeable.                                                                                                                                                                                |

---

## 2. Spacing, Alignment, and Visual Precision

### What's working

- Left panel widths are identical: `width: 380px; min-width: 320px; max-width: 420px` — consistent two-panel rhythm.
- Template list items use `px-4 py-3` uniformly with `border-b border-border` dividers.
- Tag pills use consistent `rounded-full` + `px-2 py-0.5 text-xs` sizing.

### Issues

| Area                            | Issue                                                                                                                                                                                                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Padding mismatch**            | ~~NewDocumentModal search area uses `p-3`, detail header uses `p-4`, preview pages use `0.75rem` (12px).~~ **Fixed:** Search area now uses `p-4` to match detail header. SvgPreviewPane defaults updated to `gap-4`/`p-4` (16px grid). TemplatePublishModal form/preview uses `p-6` (form context). |
| **Preview page gaps**           | ~~NewDocumentModal uses `gap-0.75rem` (12px) between preview pages. TemplatePublishModal uses `gap-4` (16px).~~ **Fixed:** Both modals now use `gap-4` (16px) for preview page gaps via SvgPreviewPane.                                                                                             |
| **Tag pill styling divergence** | NewDocumentModal tags are `border border-border` (neutral). TemplatePublishModal tags are color-coded (`bg-blue-100 text-blue-800` for unit, `bg-emerald-100 text-emerald-800` for topic) with hardcoded light/dark mode colors. The hardcoded color values bypass the design token system.         |
| **Modal dimensions**            | NewDocumentModal: `90vw / 85vh` with no max-width cap. TemplatePublishModal: `90vw / 85vh` with `max-width: 1200px`. On a 4K display the NewDocumentModal will be excessively wide.                                                                                                                 |

---

## 3. UX Flow Assessment

### NewDocumentModal

- **Good**: Auto-selects USAF Memo as default, auto-generates document name from template title, optimistic star updates.
- **Good**: Debounced search (300ms) prevents excessive API calls.
- **Concern**: Filter syntax (`unit:value`, `topic:value`) typed into a plain search box is a power-user pattern with no discoverability. Tags in the detail panel are clickable to add filters, but there's no dedicated filter UI or hint text explaining the syntax. Consider tag filter dropdowns (similar to TemplatePublishModal's BaseSelect approach).
- **Concern**: No keyboard navigation through the template list (no arrow key support in the listbox). The `role="listbox"` is present but keyboard behavior isn't implemented — an a11y gap.

### TemplatePublishModal

- **Good**: Mode-based rendering (loading → publish/manage → error) is clean. Form dirty tracking prevents accidental saves.
- **Good**: Snapshot-on-open pattern prevents reactive re-init from document edits while modal is open.
- **Concern**: After publishing, the modal closes and the user has no clear path to find their template in the library or verify it's live. A success state with a link/action would improve the flow.
- **Concern**: `window.confirm()` for unpublish is a jarring context switch from the styled modal.

---

## 4. Maintainability

### Code Duplication

**`buildSvgSrcdoc` and `extractSvgDimensions`** are copy-pasted identically across 3 files:

- `NewDocumentModal.svelte`
- `TemplatePublishModal.svelte`
- `Preview.svelte`

These should be extracted to a shared utility (e.g., `$lib/utils/svg.ts`).

**Preview rendering logic** (initialize quillmark → render → convert to SVG pages → show in iframe) is duplicated between both modals. A shared `SvgPreview` component or composable would eliminate ~40 lines per modal.

### `!important` Overrides

Both modals fight the base dialog's layout with `!important` on 5+ properties. This suggests the dialog's `size` prop system doesn't accommodate full-layout modals. Options:

1. Add a `size="panel"` or `size="split"` variant to base-dialog that provides a flex container with zero padding.
2. Use `size="fullscreen"` (already exists) and constrain width internally.

Either would eliminate the `:global()` + `!important` pattern.

### Hardcoded Colors in Tags

TemplatePublishModal uses raw Tailwind color classes (`bg-blue-100`, `dark:bg-blue-900/40`, etc.) for tag pills. These should use semantic tokens or be extracted into a shared `TagPill` component that maps categories to token-based color schemes.

### Timer Cleanup

Both modals have `previewLoadingTimer` for delayed loading spinners. Neither cleans up the timer on component unmount — if the modal unmounts during the delay, the timer fires on a destroyed component. The `$effect` cleanup pattern should be used.

---

## 5. Recommendations — All Resolved

| #   | Recommendation               | Resolution                                                                                                                                                                                                                 |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Extract SVG utilities        | Created `$lib/utils/svg.ts` with `buildSvgSrcdoc` and `extractSvgDimensions`. Removed duplicates from NewDocumentModal, TemplatePublishModal, and Preview.svelte.                                                          |
| 2   | Extract SvgPreviewPane       | Created `$lib/components/ui/svg-preview-pane.svelte` — shared component with loading/empty/pages states, configurable gap/padding. Both modals now consume it.                                                             |
| 3   | Add panel dialog size        | Added `size="panel"` to `base-dialog.svelte` — flex column layout with zero-padding content, bordered header/footer. Removed all `:global()` + `!important` overrides from both modals.                                    |
| 4   | Replace custom sort dropdown | NewDocumentModal now uses `BaseSelect` for sort, gaining keyboard nav, portal positioning, type-ahead, and click-outside for free.                                                                                         |
| 5   | Extract TagPill component    | Created `$lib/components/ui/tag-pill.svelte` with semantic token-based colors (`color-mix` on `--color-info` / `--color-success`). Both modals use it — removable pills in Publish, clickable filter pills in NewDocument. |
| 6   | Replace `window.confirm()`   | Created `$lib/components/ui/confirm-dialog.svelte` — themed, accessible confirmation dialog. TemplatePublishModal unpublish now uses it.                                                                                   |
| 7   | Listbox keyboard navigation  | NewDocumentModal template list now supports ArrowUp/Down, Home/End with scroll-into-view.                                                                                                                                  |
| 8   | Timer cleanup                | Both modals now use `$effect` return cleanup for `previewLoadingTimer` and `searchTimeout`.                                                                                                                                |

---

## Summary

All eight findings have been addressed. The changes introduce four new shared components/utilities (`svg.ts`, `SvgPreviewPane`, `TagPill`, `ConfirmDialog`) and one dialog system extension (`size="panel"`), while removing ~120 lines of duplicated code and all `!important` overrides.
