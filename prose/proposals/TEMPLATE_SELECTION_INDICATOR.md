# Improve Template Selection Indicator

**Purpose**: Make the selected-template state in `NewDocumentModal` more visually clear and satisfying to interact with.

**Status**: Proposed  
**Related**: [TEMPLATE_LIBRARY.md](../designs/TEMPLATE_LIBRARY.md), `TemplateCard.svelte`

---

## Problem

The current selected state (`template-card-selected`) is too subtle: a slightly tinted border and a faint 2px box-shadow glow. Users don't get clear confirmation that a template has been chosen, and clicking between templates feels unresponsive.

## Decisions

**No overlay elements.** Adding a checkmark badge was considered but rejected — the thumbnail area is already compact and the star badge in the top-right corner makes the space crowded, especially on mobile.

**No spring/bounce animation.** A multi-keyframe overshoot (scale 1 → 1.06 → 1.02) risks feeling stimulating or gimmicky when clicking through several templates quickly.

## Design

Two changes to `.template-card-selected .template-thumb-wrap` in `TemplateCard.svelte`:

1. **Stronger ring** — increase the box-shadow spread and opacity so the primary-color halo is immediately legible against both light and dark backgrounds.

2. **Smooth scale-up** — apply `transform: scale(1.03)` on selection, driven by a `transition` with `ease-out` timing (~150ms). No overshoot. The transition applies to the non-selected state too so de-selecting also animates cleanly.

Start conservative; iterate if it feels too flat after visual review.

## Scope

- `TemplateCard.svelte` CSS only — no logic changes, no new elements.
- Transitions should respect `prefers-reduced-motion` (skip the scale transform, keep the ring).
