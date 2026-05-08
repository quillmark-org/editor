# Simplification proposals

A critical inventory of the cuts, consolidations, and feature deletions that would meaningfully shrink the mental model of `@quillmark/editor`. Each entry below is its own document with the reasoning, the call-site evidence, and the deletion list.

## The unifying observation

`src/lib/index.ts` exports ~25 symbols beyond `DocumentEditor` as "lower-level building blocks", "Lexical primitives (advanced composition)", "Engine injection helpers", and "Editor model". Every one of them is consumed only by other internal files; none is reached by `src/routes/+page.svelte` or any other external caller. The package was built as a lego kit for hypothetical composers, but the real consumer surface is `<DocumentEditor>` plus engine injection.

Most of the cuts below follow from collapsing that fiction. Once internals stop being public API, the speculative factory splits, the duplicate type definitions, the unused composability hooks, and the stranded migration scaffolding all become deletable.

## Index

### Pure deletions (no behavior change)

| # | Proposal | Net lines |
|---|---|---|
| [01](./01-trim-public-surface.md) | Trim the public surface in `lib/index.ts` and `lib/types.ts` | ~30 |
| [02](./02-drop-unused-parsing-module.md) | Delete the unused `parsing/document-repairs.ts` + date-paths module | ~340 (+ tests) |
| [03](./03-collapse-codemirror-factories.md) | Collapse codemirror keymap/pattern factory exports | ~50 |
| [04](./04-drop-unused-overlay-hooks.md) | Drop unused overlay hooks (`use-portal`, `use-focus-trap`) | ~62 |
| [05](./05-delete-base-popover-and-label.md) | Delete unused `base-popover.svelte` and `label.svelte` | ~270 |
| [06](./06-prune-dead-component-paths.md) | Prune dead props, exports, and code paths inside live components | ~120 |
| [07](./07-fix-duplicate-types.md) | Fix the contradictory `EditorTarget` / `CardView` definitions | ~10 (bug) |

### Consolidations (small behavior-preserving rewrites)

| # | Proposal | Net lines |
|---|---|---|
| [08](./08-collapse-positioning-hook.md) | Collapse 4-strategy `usePositioning` + `useDismissible` + `useZIndex` into call sites | ~250 |
| [09](./09-replace-tooltip-with-native-title.md) | Replace the 208-line `Tooltip` with native `title=` (or a 30-line popover) | ~180 |
| [10](./10-merge-codemirror-themes.md) | Merge `editor-theme.ts` and `quillmark-theme.ts` | ~60 |
| [11](./11-unify-fold-widgets.md) | Merge `FoldableDelimiterWidget` and `ClosingDelimiterWidget` | ~25 |
| [12](./12-investigate-inline-metadata-node.md) | Investigate and remove the dead `InlineMetadataNode` machinery | ~170 |

### Feature deletions (require buy-in)

| # | Proposal | Net lines |
|---|---|---|
| [13](./13-drop-codemirror-advanced-mode.md) | Drop the CodeMirror "Advanced" editor entirely | ~4,100 |
| [14](./14-drop-inline-card-titles.md) | Drop inline-editable card titles (`PRESENTATION.name`) | ~210 |
| [15](./15-drop-preview-comfort-dim.md) | Drop the dark-mode "comfort dim" filter in Preview | ~40 |
| [16](./16-drop-preview-last-successful-fallback.md) | Drop "last successful render dimmed under error overlay" | ~60 |
| [17](./17-drop-metadata-pulse-animation.md) | Drop the one-time pulse animation on metadata widgets | ~25 |

## Suggested order

1. **PR A — Pure deletions** (#01–07): ~880 lines, near-zero risk, fixes one real type bug.
2. **PR B — Overlay collapse** (#08–09): ~430 lines, mild risk in popover positioning.
3. **PR C — Misc consolidations** (#10–12): ~255 lines, requires verifying `InlineMetadataNode` reachability before deletion.
4. **Decision gate** — feature deletions (#13–17). #13 alone is a third of the codebase; the rest are smaller comfort/UX features.

PRs A–C together delete roughly 1,500–1,700 lines with no behavior change visible to a `<DocumentEditor>` user. PR D depends on product calls.

## How to read each proposal

Every document follows the same shape:

- **Why it matters** — the leverage / mental-model cost being addressed.
- **Evidence** — file paths and line numbers from the current branch.
- **What to delete or change** — concrete cut list.
- **Risk / verification** — what could break and how to check.

The proposals are independent unless explicitly noted. #02, #04, #05 in particular can land as individual commits within a single cleanup PR.
