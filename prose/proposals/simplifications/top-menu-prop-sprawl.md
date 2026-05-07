# TopMenu Prop Sprawl

**Purpose**: Shrink `TopMenu`'s 15-prop API without breaking existing call sites.

**Status**: Proposed
**Related**: `src/lib/components/TopMenu/TopMenu.svelte`, its only caller chain (document route)

---

## Problem

`TopMenu.svelte:44-61` declares 15 props — 9 of them optional callbacks and 4 boolean flags. The pattern indicates the component has absorbed responsibilities over time:

```ts
type TopMenuProps = {
  fileName: string;
  onDownload: () => void;
  onDownloadMarkdown?: () => void;
  saveStatus?: SaveStatus;
  saveError?: string;
  onDocumentInfo?: () => void;
  onRulerToggle?: () => void;
  onPublish?: () => void;
  onShareLink?: () => void;
  hasSuccessfulPreview?: boolean;
  hasActiveEditor?: boolean;
  isTemplate?: boolean;
  sidebarExpanded?: boolean;
  onToggleSidebar?: () => void;
  onBetaProgramClick?: () => void;
  onFeedbackClick?: () => void;
};
```

Each new document-level feature adds two props (a callback and a gating flag). Testing in isolation becomes painful, and call sites pass the same 10+ callbacks in one long object literal.

## Scope

In-scope: reducing the **public** surface of `TopMenu`. Out of scope: changing what the menu *does* visually.

## Options — pick one, don't combine

### A. Split by concern (recommended)

Factor out three subcomponents that each own their callbacks:

- `<DocumentActions>` — download, download markdown, document info, share, publish, ruler toggle
- `<AccountMenu>` — beta program, feedback, (future) account settings
- `<TitleBar>` — file name editing + sidebar toggle + save status

Each reads directly from the stores it already imports (`documentStore`, `rulerStore`, `userStore`). The parent page composes them inside a flex row. `TopMenu.svelte` becomes a thin shell (or goes away).

Cost: one PR, ~150 lines moved. Benefit: each subcomponent is independently testable and adding a new action only touches one file.

### B. Context-based handler bus

Keep `TopMenu` as one component but read its callbacks from a `DocumentActionsContext` set by the route. Props drop to 3-4 (`fileName`, flags).

Cost: smaller diff. Benefit: less. Pitfall: implicit dependencies (context) trade prop sprawl for less-greppable data flow.

### C. Group callbacks into an `actions` object

```ts
actions: {
  download: () => void;
  downloadMarkdown?: () => void;
  /* … */
};
```

Purely cosmetic — same coupling, fewer top-level props. Skip this unless A/B are blocked.

## Recommendation

**A.** The component is doing three jobs. Splitting aligns with how features actually get added.

## Non-goals

- Don't introduce a generic "toolbar framework." The only other toolbar-ish UI is the editor, and it has different needs.
- Don't migrate call sites to a `<slot>`-based API — Svelte 5 snippets make this tempting, but TopMenu's items aren't user-composable in practice.

## Risk

Medium. The component touches the main document page, which has e2e coverage. Ship behind a single commit so git-diff review is manageable.
