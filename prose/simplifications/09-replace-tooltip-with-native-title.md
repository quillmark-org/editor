# 09 — Replace `Tooltip` with native `title=` (or a 30-line popover)

## Why it matters

`src/lib/ui/tooltip.svelte` is 208 lines: hover detection with 100ms delay, long-press touch detection (500ms with finger-move cancellation), portal-rendered floating element, scroll/resize position tracking via `usePositioning`, suppression of synthetic hover events after touch, custom enter animation, document-level dismissal listeners.

It is used in **exactly one place**: `wizard/fields/FieldHeader.svelte:27`, to show a field description on hover of a small `(i)` info icon next to the field label. That's a hover hint — the platform already has `title=`.

Replacing it with a native attribute (or, if more control is wanted, a 30-line custom popover) deletes ~180 lines and removes the last consumer of `usePositioning` (proposal #08), the second consumer of `Portal`, and a fair chunk of touch-event-handling complexity.

## Evidence

`src/lib/components/wizard/fields/FieldHeader.svelte:24-37`:

```svelte
{#if description}
    <Tooltip content={description} delay={300}>
        <button …>
            <span class="truncate">{label}</span>
            …
            <Info class="h-3 w-3 …" />
        </button>
    </Tooltip>
{:else}
    <button …>{label}{#if required}<span …>*</span>{/if}</button>
{/if}
```

The tooltip wraps an `<Info>` icon that already carries the same information visually (it's a hint-presence indicator). On desktop, `title="..."` on the button renders OS-native tooltip with built-in delay, hover detection, and dismissal. On touch, native `title` doesn't work — but the long-press feature in `tooltip.svelte` is also barely discoverable.

The `Tooltip` component import is 1 line; the consumed feature surface is `content` and `delay`. None of the touch-handling, scroll-tracking, or animation features are required by this single use.

## What to change

**Option A (simplest, recommended)**

Replace the `<Tooltip>` wrapper with a `title={description}` attribute on the button:

```svelte
<button
    type="button"
    title={description}
    class="…"
    onclick={onLabelClick}
>
    <span class="truncate">{label}</span>
    {#if required}<span class="text-destructive flex-shrink-0">*</span>{/if}
    <Info class="h-3 w-3 flex-shrink-0 text-muted-foreground/50" />
</button>
```

Then delete `src/lib/ui/tooltip.svelte`, the `Tooltip` import in `FieldHeader.svelte`, and (after #08) `usePositioning`.

**Option B (if branded styling matters)**

Replace with a small inline popover: `<span class="qm-hint" data-hint={description}>` plus 30 lines of CSS using `:hover::after { content: attr(data-hint); … }`. No JS required. Same visual result, no portal, no positioning math.

## Risk / verification

- `title="..."` is universal and accessible; Option A loses the custom styling but gains AT/keyboard-focus support for free.
- Option B keeps the custom look but requires a bit of CSS positioning to handle viewport edges.
- Smoke-test: hover a field with a description; confirm the description appears.

## Cascade

- ~180 lines deleted.
- Eliminates the last caller of `usePositioning` → `utils/overlay/` becomes deletable (combined with #04, #05, #08).
- Removes one of two callers of `Portal` (the other is `SelectionToolbar`); `Portal` itself can stay.
