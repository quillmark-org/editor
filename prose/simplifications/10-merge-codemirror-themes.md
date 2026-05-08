# 10 — Merge `editor-theme.ts` and `quillmark-theme.ts`

## Why it matters

`src/lib/utils/editor-theme.ts` (60 lines) and `src/lib/editor/codemirror/quillmark-theme.ts` (214 lines) are two CodeMirror theme builders, both reading the same `--qm-*` CSS custom properties from the same host element, both consumed by the same `MarkdownEditor.svelte:68-70` and composed in series:

```ts
createEditorTheme(),
quillmarkDecorator,
createQuillmarkTheme(),
```

The split exists because `editor-theme.ts` styles built-in CodeMirror selectors (`.cm-content`, `.cm-line`, `.cm-cursor`, gutters) and `quillmark-theme.ts` styles QuillMark-specific decoration classes (`.cm-quillmark-delimiter`, `.cm-markdown-bold-delimiter`, etc.). Both are CodeMirror `EditorView.theme(...)` extensions. Both run `getComputedStyle(host)` and the same `closest('.qm-dark')` check.

Merging eliminates one redundant `getComputedStyle` pass, one redundant dark-mode probe, and one barrel-export. It also makes the theme contract obvious: there is one theme.

## Evidence

`utils/editor-theme.ts:12-58`:

```ts
export function createEditorTheme(host: Element = document.documentElement): Extension {
    const styles = getComputedStyle(host);
    const isDark = host.closest?.('.qm-dark') != null;
    const v = (name: string, fallback = '') => (styles.getPropertyValue(name) || fallback).trim();
    return EditorView.theme({ '&': { … }, '.cm-content': { … }, '.cm-cursor': { … }, … }, { dark: isDark });
}
```

`editor/codemirror/quillmark-theme.ts:9-213`:

```ts
export function createQuillmarkTheme(host: Element = document.documentElement): Extension {
    const styles = getComputedStyle(host);
    const isDark = host.closest?.('.qm-dark') != null;
    const getCssVar = (name: string): string => styles.getPropertyValue(name).trim();
    return EditorView.theme({ '.cm-quillmark-delimiter': { … }, '.cm-markdown-bold-delimiter': { … }, … }, { dark: isDark });
}
```

Same prelude, same dark check, two helpers (`v` vs `getCssVar`) doing the same thing.

## What to change

Combine into a single `editor/codemirror/theme.ts` that returns one merged theme spec. Move `createEditorTheme`'s built-in selector rules into the same `EditorView.theme({...})` literal as the QuillMark selectors. Delete `utils/editor-theme.ts`. Update `MarkdownEditor.svelte:14, 68-70` to import once.

Keep one helper named `getCssVar` (or `v`) — the choice is taste.

## Risk / verification

- Visually compare the markdown editor before/after in light and dark modes. The merged theme should render identically.
- `npm run check` should be green.
- This is a no-op refactor; no behavioral change.

## Cascade

- ~60 lines net (mostly the duplicated prelude + double `EditorView.theme` overhead).
- After #13 lands (drop CodeMirror entirely), this proposal is moot. Address one or the other.
- If #13 is rejected, this is still worth doing.
