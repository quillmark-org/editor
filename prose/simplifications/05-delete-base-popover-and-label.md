# 05 — Delete unused `base-popover.svelte` and `label.svelte`

## Why it matters

Two files in `src/lib/ui/` are imported nowhere:

- `base-popover.svelte` (244 lines) — a fully-featured popover with title, header/footer slots, side/align positioning, close-on-escape, close-on-outside, ARIA dialog semantics, and the `useDismissible` + `useZIndex` + `usePositioning` triumvirate.
- `label.svelte` (26 lines) — a `<label>` wrapper that injects a `qm-label` class.

Both look load-bearing because they exist; in fact they are zero-impact deletions.

## Evidence

```
$ grep -rn "base-popover\|BasePopover" src --include="*.ts" --include="*.svelte" \
       | grep -v "ui/base-popover.svelte"
(no output)

$ grep -rn "ui/label\|<Label" src --include="*.ts" --include="*.svelte" \
       | grep -v "ui/label.svelte"
(no output)
```

Field labels are rendered directly in `wizard/fields/FieldHeader.svelte:24-47` as `<button type="button" ...>{label}</button>` (clickable to focus the field). The `qm-label` class string defined in `label.svelte` is referenced nowhere else.

`base-popover.svelte` was likely transplanted from a reference app (the codebase has `references/tonguetoquill-web/`) and never connected. It is the main consumer of `useDismissible` (`src/lib/utils/overlay/use-dismissible.ts`) and `useZIndex` (`src/lib/utils/overlay/use-zindex.ts`) — once `BasePopover` is gone, those two hooks have only `tooltip.svelte` (and not even that — see proposal #09) and one other caller respectively.

## What to delete

- `src/lib/ui/base-popover.svelte` (244 lines)
- `src/lib/ui/label.svelte` (26 lines)

## Risk / verification

- `npm run check` — should remain green.
- Visual smoke test of the playground (`/`) — popovers shouldn't be visible because nothing rendered them in the first place.

## Cascade

- ~270 lines removed.
- Combined with #04 and #08, the entire `utils/overlay/` directory becomes deletable.
- `BasePopover` was the heaviest user of `useDismissible` and `useZIndex`; once it's gone, those hooks have at most one trivial caller and inline easily.
