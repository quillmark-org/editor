# 08 — Collapse `usePositioning` + `useDismissible` + `useZIndex` into call sites

## Why it matters

`utils/overlay/use-positioning.ts` (216 lines), `utils/overlay/use-dismissible.ts` (68 lines), and `utils/overlay/use-zindex.ts` (49 lines) are factored as if they were composition primitives for an overlay framework. They are imported by exactly two files (`tooltip.svelte` and `base-popover.svelte`), and proposal #05 deletes one of them. After #05, these hooks each have **at most one** caller — yet they retain abstractions for hypothetical other callers.

`usePositioning` is the worst offender: it implements 4 strategies (`center`, `relative`, `side`, `corner`), of which 3 return `{top: 0, left: 0}` placeholders that "work" only because the layout is actually CSS-driven. Only the `relative` strategy contains real math.

## Evidence

`use-positioning.ts:43-56`:

```ts
function calculatePosition(element: HTMLElement): Position {
    switch (strategy) {
        case 'center':   return calculateCenterPosition();   // returns {0,0}
        case 'relative': return calculateRelativePosition(...);
        case 'side':     return calculateSidePosition(side); // returns {0,0}
        case 'corner':   return calculateCornerPosition(...);// returns {0,0}
        default:         return { top: 0, left: 0 };
    }
}
```

The functions for `center`, `side`, `corner` all carry identical bodies:

```ts
function calculateCenterPosition(): Position { return { top: 0, left: 0 }; }
function calculateSidePosition(_side: Side): Position { return { top: 0, left: 0 }; }
function calculateCornerPosition(_side: Side, _align: Align): Position { return { top: 0, left: 0 }; }
```

Only `relative` (lines 80-158) runs real geometry. Both callers pass `strategy: 'relative'` (`base-popover.svelte:132`, `tooltip.svelte:121`).

`use-dismissible.ts` is a 5-line keydown helper plus a thin wrapper around `clickOutside`. The keydown logic:

```ts
function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && onEscape) { event.preventDefault(); onEscape(); }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && onSubmit) {
        event.preventDefault(); onSubmit();
    }
}
```

`use-zindex.ts` maintains a per-instance counter for popover stacking. The comment at lines 7-12 admits "we don't dispatch close events globally" — the abstraction has been gutted; what remains is a counter.

## What to change

1. **Delete `utils/overlay/use-positioning.ts`.** Move the 50-ish lines of relative-positioning math (`calculateRelativePosition` body) inline into `tooltip.svelte` and `base-popover.svelte`'s `$effect`. After proposal #05 deletes `base-popover`, only `tooltip.svelte` keeps the math — and after proposal #09 even that goes away.

2. **Delete `utils/overlay/use-dismissible.ts`.** Inline the 8-line keydown handler into `base-popover.svelte` (`onkeydown={(e) => { if (e.key === 'Escape') close() }}`). The `clickOutside` action from `utils/use-click-outside.ts` is already inlinable directly.

3. **Delete `utils/overlay/use-zindex.ts`.** Replace with a simple module-level counter or a CSS variable. After #05 deletes `base-popover`, the only caller is gone.

4. **After #04, #05, #08 land**, the entire `src/lib/utils/overlay/` directory is empty and can be removed.

## Risk / verification

- Tooltip positioning needs a smoke test (hover a wizard field's `(i)` info icon at top/bottom/right edges of the viewport). The relative-positioning math is the same; just inlined.
- Popover behaviour is N/A after #05.
- `npm run check` should remain green throughout.

## Cascade

- ~250 lines deleted (216 + 68 + 49 minus the inlined math).
- Eliminates the entire `utils/overlay/` subdirectory once #04 and #05 land.
- Removes the false impression of a coherent overlay framework.
