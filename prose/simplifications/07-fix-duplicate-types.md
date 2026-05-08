# 07 — Fix the contradictory `EditorTarget` / `CardView` definitions

## Why it matters

Two source files define `EditorTarget` and `CardView` with **incompatible shapes**. The public types in `lib/types.ts` disagree with the internal types every component actually uses. This is a real type-safety bug masked by the fact that the public types are never imported by working code.

Fixing it deletes ~20 lines and removes a class of latent bug from the package boundary.

## Evidence

`src/lib/types.ts:81-90`:

```ts
export type EditorTarget = { kind: 'main' } | { kind: 'card'; id: number };

export interface CardView {
    id: number;
    tag: string;
    body: string;
    fields: Record<string, unknown>;
}
```

`src/lib/editor/editorState.svelte.ts:34, 61`:

```ts
import type { Card, Diagnostic, Document } from '@quillmark/wasm';
…
export type CardView = Card;
…
export type EditorTarget = { kind: 'main' } | { kind: 'card'; index: number };
```

The public version uses `id: number`; the internal version uses `index: number`. `MetadataWidget.svelte:11`, `WizardCore.svelte:16`, and `VisualEditor.svelte:6` all import from `editor/editorState.svelte.ts` (the `index` shape) — they correctly identify cards by positional index, matching the wasm `Document` API which uses positional indices everywhere (`updateCardField(index, ...)`, `removeCard(index)`, etc.).

`CardView` is similar: the public interface invents fields (`id`, `body`, `fields`) while the internal `CardView = Card` re-exports the wasm `Card` type, which has `frontmatter` (not `fields`) and uses different naming.

These public types are exported from `lib/index.ts:34-35`:

```ts
export type {
    …
    EditorTarget,
    CardView
} from './types.js';
```

A consumer who imported `EditorTarget` from `@quillmark/editor` would get a type that doesn't match what any component accepts.

## What to change

1. Delete the `EditorTarget` and `CardView` definitions from `src/lib/types.ts:81-90`.
2. In `src/lib/index.ts`, either drop these from the type re-export list (recommended, given proposal #01 is collapsing the surface anyway), or re-export them from `./editor/editorState.svelte.js` so the public type matches the internal one:

   ```ts
   export type { EditorTarget, CardView } from './editor/editorState.svelte.js';
   ```

3. Audit any consumer code that imported the broken shape — there is none in this repo, so no fixup needed beyond the file edits.

## Risk / verification

- `npm run check` should remain green; no internal code imports the broken shape.
- The fact that this never broke is itself evidence that the public types are unused.

## Cascade

- Settles a real correctness issue.
- Reinforces #01: the public-surface bloat in `types.ts` carries silent contract bugs because nobody validates speculative types against actual usage.
