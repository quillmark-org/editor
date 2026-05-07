# Preload NewDocumentModal Gallery

**Purpose**: Eliminate the loading state on first modal open by shifting the template list fetch earlier—before the user clicks "New Document."

**Status**: Proposed  
**Related**: [TEMPLATE_LIBRARY.md](../designs/TEMPLATE_LIBRARY.md)

---

## Problem

When the user opens `NewDocumentModal`, `fetchGallery(null)` fires and the modal shows a loading spinner until `GET /api/templates` resolves. The response is CDN-cached (5 min) so server cost is low, but the round-trip still causes a visible delay on first open.

## Design

Introduce a thin prefetch module (`template-prefetch.ts`) that owns a singleton `Promise` for the template list response. The modal always reads from this module instead of calling `listLibraryTemplates` directly for the home view.

### Module: `template-prefetch.ts`

- **`prefetchTemplateList()`** — calls `listLibraryTemplates({ sort: 'recommended', limit: 100 })` and stores the resulting `Promise`. Subsequent calls return the same promise (deduplication). A resolved promise expires after ~60 s (`setTimeout` nulls it out) so the modal never renders minutes-stale data.

- **`getCachedTemplateList()`** — returns the stored `Promise`, or `null` if none exists. Exists only for testability; production code uses `prefetchTemplateList()` everywhere.

### Trigger points

In `Sidebar.svelte`, call `prefetchTemplateList()` on:

1. `pointerenter` on the "New Document" button — starts the fetch ~200-500 ms before a click lands.
2. `focus` on the same button — covers keyboard navigation.
3. `click` (the existing open handler) — guarantees the fetch has started even if the user clicks instantly without hovering.

### Consumer: `NewDocumentModal.svelte`

`fetchGallery(null)` replaces its direct `listLibraryTemplates` call with `await prefetchTemplateList()`. One code path—no fallback branching. If the prefetch is already resolved, the `await` completes synchronously; if in-flight, the modal waits for it; if never triggered (programmatic open), the call simply starts the fetch on the spot.

### What stays the same

- **Recents and starred IDs** — user-specific, cheap, and fetched in parallel on modal open. Not worth prefetching.
- **Thumbnails** — already persisted in browser Cache Storage by `content_hash`. The existing prefetch-on-open logic is sufficient.
- **Server/API layer** — no new endpoints, no schema changes, no CDN config changes.

## Non-goals

- SSR/layout-data preloading (bloats every page load even when the modal is never opened).
- Service worker caching (disproportionate complexity).
- Eager fetch on app init (wastes a request when the user never creates a document).
