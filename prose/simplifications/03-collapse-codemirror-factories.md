# 03 — Collapse codemirror keymap and pattern factory exports

## Why it matters

`src/lib/editor/codemirror/index.ts` re-exports 5 keymap factories and 6 pattern detectors as if external code might need to compose them. Nothing outside the codemirror folder uses any of them. The barrel exports + per-helper `export function` are pure noise that bloat the public API and obscure that everything in this directory is private to the markdown editor.

## Evidence

`src/lib/editor/codemirror/index.ts` exports these factories from `editor-keybindings.ts`:

```ts
export {
    createEditorKeymaps,
    createListContinuationKeymap,
    createTabIndentKeymap,
    createShiftTabUnindentKeymap,
    createFormattingKeymaps,
    createToggleFrontmatterKeymap,
    type EditorKeymapOptions
} from './editor-keybindings';
```

But every individual factory is called only by `createEditorKeymaps` itself (`editor-keybindings.ts:278-285`):

```ts
export function createEditorKeymaps(options: EditorKeymapOptions = {}): Extension {
    const bindings: KeyBinding[] = [
        createListContinuationKeymap(),
        createTabIndentKeymap(),
        createShiftTabUnindentKeymap(),
        ...createFormattingKeymaps(options)
    ];
    const toggleBinding = createToggleFrontmatterKeymap(options.onToggleFrontmatter);
    if (toggleBinding) bindings.push(toggleBinding);
    return keymap.of(bindings);
}
```

`grep -rn "createListContinuation\|createTabIndent\|createShiftTab\|createFormattingKeymaps\|createToggleFrontmatter"` outside the codemirror folder: zero hits.

Similarly for pattern detectors:

```ts
export {
    isMetadataDelimiter,
    findMetadataBlocks,
    findMarkdownBold,
    findMarkdownItalic,
    findMarkdownLinks,
    findMarkdownPlaceholders
} from './quillmark-patterns';
```

`isMetadataDelimiter` is used by `quillmark-folding.ts` and `quillmark-patterns.ts` itself. `findMetadataBlocks` is used by `quillmark-decorator.ts`, `quillmark-fold-utils.ts`, and the test file. `findMarkdownBold/Italic/Links/Placeholders` are used only by `quillmark-decorator.ts`. The fold utilities (`foldMetadataBlockAtPosition`, `foldAllMetadataBlocks`, `toggleAllMetadataBlocks`, `toggleMetadataBlockAtCursor`) are used only by `quillmark-decorator.ts` and `MarkdownEditor.svelte`.

`MarkdownEditor.svelte:15-23` imports the lot through the barrel:

```ts
import {
    quillmarkDecorator,
    createQuillmarkTheme,
    quillmarkFoldService,
    foldAllMetadataBlocks,
    toggleAllMetadataBlocks,
    createEditorKeymaps,
    placeholderClickHandler
} from '$lib/editor/codemirror';
```

It uses 7 names — all of which are first-class citizens in their own files. The barrel adds nothing.

## What to change

1. In `editor/codemirror/editor-keybindings.ts`: change `export function createListContinuationKeymap`, `createTabIndentKeymap`, `createShiftTabUnindentKeymap`, `createFormattingKeymaps`, `createToggleFrontmatterKeymap` to plain `function`. Keep only `createEditorKeymaps` exported.

2. In `editor/codemirror/quillmark-patterns.ts`: change `export function findMarkdownBold`, `findMarkdownItalic`, `findMarkdownLinks`, `findMarkdownPlaceholders` to be exported only via direct import from `quillmark-decorator.ts`. (They need to remain `export` because they cross file boundaries; that's fine. But they don't need to be in the barrel.)

3. In `editor/codemirror/index.ts`: collapse to the actual public-from-codemirror surface needed by `MarkdownEditor.svelte`:

```ts
export { quillmarkDecorator } from './quillmark-decorator';
export { createQuillmarkTheme } from './quillmark-theme';
export { quillmarkFoldService } from './quillmark-folding';
export { placeholderClickHandler } from './placeholder-handler';
export { foldAllMetadataBlocks, toggleAllMetadataBlocks } from './quillmark-fold-utils';
export { createEditorKeymaps } from './editor-keybindings';
```

Six exports instead of ~20. After proposal #01 even this barrel doesn't need to escape `lib/index.ts`.

## Risk / verification

- `npm run check` should be green; no `import` site outside the codemirror folder uses the removed names.
- The `quillmark-patterns.test.ts` still imports `isMetadataDelimiter` directly from `./quillmark-patterns` — fine, that's a sibling import not the barrel.

## Cascade

- ~50 lines of barrel/export noise removed.
- Makes the next deletion (#13, drop the entire codemirror layer) easier — fewer external surfaces to audit.
