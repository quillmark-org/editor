# 15 — Drop the dark-mode "comfort dim" filter in Preview

## Why it matters

`Preview.svelte` carries a feature where the rendered SVG/PDF dims to `brightness(0.863) saturate(0.8)` in dark mode, with a 2.4-second fade transition, undimming on hover (desktop) or 200ms touch-hold (mobile). The motivation is "documents are usually black-on-white; in dark mode the contrast is jarring".

This adds non-trivial machinery for what is, at best, a personal taste — and most users browsing dark-mode docs are accustomed to bright white pages anyway.

## Evidence

`src/lib/components/Preview.svelte`:

- **State** (lines 55-61): `isDarkMode`, `themeObserver: MutationObserver`, `isHolding`, `holdTimer`.
- **Touch handlers** (lines 63-75): `onTouchStart`/`onTouchEnd` with 200ms timeout to flip `isHolding`.
- **Theme observer** (lines 272-282): walks up to `.qm-dark`, sets up a `MutationObserver` on `document.documentElement` to track class changes.
- **Two render branches use the filter** (lines 476-478, 529-531): bind `class:preview-comfort-active={isDarkMode && !isHolding}` and `ontouchstart`/`ontouchend`/`ontouchcancel`.
- **CSS** (lines 587-594):

  ```css
  .preview-comfort-active {
      filter: brightness(0.863) saturate(0.8);
      transition: filter 2.4s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .preview-comfort-active:hover { filter: brightness(1) saturate(1); }
  ```

## What to delete

- `isDarkMode`, `themeObserver`, `isHolding`, `holdTimer` state declarations
- `onTouchStart`, `onTouchEnd` functions
- The `MutationObserver` setup in `onMount` (lines 272-282) and disconnect in `onDestroy` (lines 286-288)
- The `class:preview-comfort-active` binding and `ontouchstart`/`ontouchend`/`ontouchcancel` handlers on the SVG container and PDF container
- The two CSS rules

## Risk / verification

- If users have already adapted to the dim, they may notice the change. Ship-note the removal.
- Smoke: dark mode still renders the preview correctly; no `MutationObserver` left behind.

## Cascade

- ~40 lines removed.
- One `MutationObserver` lifecycle removed from the component's onMount/onDestroy hooks.
- Preview's render branches simplify (no more class/handler bindings on the wrapper).
