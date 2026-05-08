# 12 — Investigate and remove the dead `InlineMetadataNode` machinery

## Why it matters

The Lexical layer carries a `DecoratorNode` subclass (`InlineMetadataNode`, 127 lines) and a `MultilineElementTransformer` (`INLINE_METADATA`, 37 lines in `transformers.ts`) whose entire purpose is to round-trip `--- ... ---` blocks inside the BodyEditor. But `BodyEditor` is fed `editorStore.mainBody` and `card.body`, which the wasm `Document` already strips of frontmatter before exposing.

If the body never contains `--- ... ---` blocks, this machinery never fires — but it's still loaded into the editor's node registry, the markdown shortcut handler, and the import/export passes on every keystroke. Plus the `qm-inline-metadata` CSS rule in `BodyEditor.svelte:326-333` is styling a node that's never created.

## Evidence

`src/lib/editor/lexical/transformers.ts:48-73` defines:

```ts
export const INLINE_METADATA: MultilineElementTransformer = {
    dependencies: [InlineMetadataNode],
    regExpStart: /^---\s*$/,
    regExpEnd: /^---\s*$/,
    replace: (root, _children, _start, _end, lines, isImport) => {
        if (!isImport) return false;
        const content = (lines ?? []).join('\n').trim();
        root.append($createInlineMetadataNode(content));
        return true;
    },
    export: (node) => {
        if (!$isInlineMetadataNode(node)) return null;
        const body = node.getContent();
        return body ? `---\n${body}\n---` : `---\n---`;
    },
    type: 'multiline-element'
};
```

Data flow into `BodyEditor`:

- **Primary body** (`VisualEditor.svelte:113`): `let mainBody = $derived(editorStore.mainBody)` → `editorState.svelte.ts:138-141` → `this._doc?.main.body ?? ''`. The wasm `Document.main.body` is the body **after** frontmatter has been parsed out.
- **Card body** (`VisualEditor.svelte:373`): `card.body` from `editorStore.cards`. Same story — body after wasm parses out frontmatter and card-tag YAML.
- **Markdown field** (`wizard/fields/MarkdownField.svelte:52-57`): a single field's markdown value. Even more constrained — never a full document with frontmatter.

In all three cases, the BodyEditor sees only post-stripped body content. A `---` line in body content would now be a horizontal-rule, which `INLINE_METADATA.regExpStart` matches but `@lexical/markdown` does not have an HR transformer (per the comment at `transformers.ts:46-47`), so the inline-metadata transformer would silently consume any HR. **But there are no HR or `---` blocks in body text in this domain** because Quillmark templates use frontmatter for all metadata.

## Verification (do this first)

Add a `console.warn` inside the `replace` callback:

```ts
replace: (root, _c, _s, _e, lines, isImport) => {
    if (!isImport) return false;
    console.warn('[InlineMetadataNode] match', lines);
    …
}
```

Run the playground for 5 minutes with realistic content (the bundled `usaf_memo` sample has no body `---`). If it never fires, the entire mechanism is unreachable for real usage.

## What to delete

If the verification confirms zero hits:

- `src/lib/editor/lexical/inline-metadata-node.ts` (127 lines)
- `INLINE_METADATA` const in `src/lib/editor/lexical/transformers.ts:48-73` (~30 lines)
- `InlineMetadataNode` from the `nodes: [...]` array in `editor/lexical/editor-config.ts:50-67`
- The `qm-inline-metadata` CSS rule in `src/lib/components/BodyEditor.svelte:326-333`
- The `Inline metadata separator` comment block above it
- All `Inline*` exports from `editor/lexical/index.ts:13-18` and `lib/index.ts:47-49`
- `SerializedInlineMetadataNode` type
- `QUILLMARK_TRANSFORMERS` becomes:

  ```ts
  export const QUILLMARK_TRANSFORMERS = [...TRANSFORMERS, UNDERLINE];
  ```

  — and the `dependencies: [InlineMetadataNode]` reference on `INLINE_METADATA` no longer pulls the node into the bundle.

## Risk / verification

- The verification step above is mandatory — don't skip it.
- After deletion, paste a markdown body containing a literal `---` line into the visual editor. Confirm:
    - It renders as a horizontal rule (or as plain `---` text, depending on Lexical's HR behavior). Either is acceptable.
    - It round-trips through serialize/deserialize without data loss.
- If the verification fires, the mechanism is reachable; either keep it or document where the body can carry frontmatter and reconsider the architecture.

## Cascade

- ~170 lines + several CSS rules removed.
- Removes the motivation for `BodyEditor.onParseFallback` + `VisualEditor.bodyParseFallback` banner (proposal #06) — those were ProseMirror-era safeguards that survived the migration.
- Removes the pseudo-public `$createInlineMetadataNode` / `$isInlineMetadataNode` from `lib/index.ts` (proposal #01).
