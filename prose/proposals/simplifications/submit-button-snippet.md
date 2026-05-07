# Shared Submit Button with Loading State

**Purpose**: Collapse the repeated "button with inline `Loader2` spinner + disabled-while-submitting" pattern into a single component.

**Status**: Proposed
**Related**: `src/lib/components/ui/button.svelte`, all form-submitting modals

---

## Problem

The exact pattern below is duplicated across at least 6 modals:

```svelte
<Button type="submit" disabled={isSubmitting}>
  {#if isSubmitting}
    <Loader2 class="mr-2 h-4 w-4 animate-spin" />
    Submitting…
  {:else}
    Submit
  {/if}
</Button>
```

Call sites:
- `BetaFeedbackModal.svelte:336`
- `PromoteToPublishModal.svelte:54`
- `TemplatePublishModal.svelte:316, 341`
- `TemplateDivergenceBanner.svelte:150, 162`
- plus the larger-spinner variants (`h-5 w-5`) in `BetaRecruitmentModal.svelte:132, 155` and `ShareModal.svelte:111, 138`

Three things repeat: icon size classes, the animate-spin directive, and the pairing of `disabled={isSubmitting}` with a label swap. Getting one of the three wrong (e.g., forgetting `disabled`) is an easy accessibility regression.

## Scope

In-scope: a single `<LoadingButton>` (or a new `loading` prop on the existing `Button`) that owns the spinner + disabled behavior.

Out of scope: the dialog wrapper itself, the idle/loading/success/error state machine, the per-modal copy. Don't build a "generic form modal" — the 6 modals diverge too much in structure for that to pay off.

## Design sketch

Two viable shapes — pick one:

**A. New prop on `Button`**: add `loading?: boolean` and `loadingLabel?: string`. When `loading`, the button renders the spinner before the slot, forces `disabled`, and optionally swaps the label. Minimizes new surface area.

**B. `<LoadingButton>` wrapper** that composes `Button`. Clearer call sites, but adds a component to maintain.

Prefer A unless the spinner placement needs to vary (it currently doesn't).

## Non-goals

- Don't introduce this for the 2-site `fetch()` wrapper or the 2-site async-form-state rune. Those are still too early.
- Don't touch `TemplateCard.svelte`'s spinner — it's a loading indicator for a card, not a button.

## Risk

Very low. The migration is mechanical and each call site is local.
