# 11 — Merge `FoldableDelimiterWidget` and `ClosingDelimiterWidget`

## Why it matters

`src/lib/editor/codemirror/quillmark-decorator.ts:31-70` defines two `WidgetType` subclasses that are byte-for-byte identical except for the class name:

```ts
class FoldableDelimiterWidget extends WidgetType {
    constructor(private lineNumber: number) { super(); }
    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement('span');
        span.className = 'cm-quillmark-delimiter';
        span.textContent = '---';
        span.style.cursor = 'pointer';
        span.onclick = (e) => {
            e.preventDefault();
            const pos = view.posAtDOM(span);
            foldMetadataBlockAtPosition(view, pos);
        };
        return span;
    }
}

class ClosingDelimiterWidget extends WidgetType {
    constructor(private lineNumber: number) { super(); }
    toDOM(view: EditorView): HTMLElement {
        // identical body
    }
}
```

The `lineNumber` field is stored on each instance but never read. The two classes are instantiated separately in `collectBlockDecorations` (lines 248, 276) — distinguishing opening vs closing delimiter — but both produce the same DOM and call the same `foldMetadataBlockAtPosition` handler.

## What to change

Replace both classes with one:

```ts
class DelimiterFoldWidget extends WidgetType {
    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement('span');
        span.className = 'cm-quillmark-delimiter';
        span.textContent = '---';
        span.style.cursor = 'pointer';
        span.onclick = (e) => {
            e.preventDefault();
            foldMetadataBlockAtPosition(view, view.posAtDOM(span));
        };
        return span;
    }
}
```

Update both call sites in `collectBlockDecorations` to pass `new DelimiterFoldWidget()` (no argument).

## Risk / verification

- Behaviorally identical: both old widgets had identical `toDOM`. Unused constructor params are dropped.
- Visual smoke: opening and closing `---` lines should still be clickable and trigger fold/unfold.

## Cascade

- ~25 lines deleted (one class + the `lineNumber` parameter on the other).
- Tiny, but illustrative of duplication that propagates when files grow large.
- After #13 lands (drop CodeMirror entirely), this proposal is moot.
