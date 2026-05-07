# Editor Substrate Audit

Findings in the non-Svelte TypeScript that backs the editor components: `src/lib/editor/**`. Where a store, schema, or plugin is imported only by Svelte components, it is audited here.

See also: [`prose/designs/VISUAL_EDITOR.md`](../../designs/VISUAL_EDITOR.md) and the existing proposal [`prose/proposals/simplifications/prosemirror-serializer-types.md`](../../proposals/simplifications/prosemirror-serializer-types.md).

---

## H1. `editorState.svelte.ts` — parse, serialize, and mutations in one 731-LOC file

**File:** `src/lib/editor/editorState.svelte.ts:1-731`

Four concerns, any one of which would be its own module:

| Concern | Lines | What's here |
|---|---|---|
| Parsing | `166-258` | `parseToEditorState`, deterministic id assignment, YAML extraction |
| Serialization | `280-381` | `rebuildBlocksFromState`, `toDocumentString` |
| Derived selectors | `116-151` | `derivePrimaryBody`, `deriveFrontmatterRaw`, etc. |
| Mutations | `450-730` | 11 mutation methods: `setCardField`, `setCardFields`, `setFrontmatterField`, `updateCardBody`, `updateCardMetadata`, etc. |

The self-noted remediation at `editorState.svelte.ts:468` (dual-state drift fix — parse metadata when raw is set) is correct and should be preserved, but it's easier to reason about that invariant when mutations are not also living next to 300 lines of serialization scaffolding.

**Suggested split:**
- `src/lib/editor/parse.ts` — `parseToEditorState`, id assignment.
- `src/lib/editor/serialize.ts` — `rebuildBlocksFromState`, `serializeFromEditorState`, YAML key-order helpers (see M2).
- `src/lib/editor/card-utils.ts` — deterministic id generation (`editorState.svelte.ts:90-110`).
- `src/lib/editor/editorState.svelte.ts` — keeps the store class, derived selectors, and mutation methods. Imports parse/serialize.

---

## M1. YAML AST mutation via `as any` repeated 3 times

**File:** `src/lib/editor/editorState.svelte.ts:525-534, 567-575, 617-624`

Same pattern in three methods:

```ts
const contents = block.doc.contents;
if (contents && typeof contents === 'object' && 'items' in contents) {
  const items = (contents as any).items as any[];
  const cardIdx = items.findIndex((item: any) => item.key?.value === 'CARD');
  if (cardIdx > 0) {
    const [cardItem] = items.splice(cardIdx, 1);
    items.unshift(cardItem);
  }
}
```

Two smells bundled together:
1. **Type escape.** `yaml` publishes types; the casts are compensating for something (either an old version or a `YAMLMap` import that isn't reaching the checker). Pin the right types or declare a local alias.
2. **Copy-paste reordering.** "Ensure `CARD` and `QUILL` sort first in the document's items array" is policy; policy should live in one helper.

**Suggested fix:**

```ts
function enforceYamlKeyOrder(doc: Document, keyOrder: string[]) {
  const contents = doc.contents;
  if (!isMap(contents)) return;
  for (const key of [...keyOrder].reverse()) {
    const idx = contents.items.findIndex(i => i.key?.value === key);
    if (idx > 0) contents.items.unshift(contents.items.splice(idx, 1)[0]);
  }
}
```

Export from `src/lib/editor/serialize.ts`; call from all three sites. Zero `any`.

---

## M2. Decorator + folding re-parse metadata blocks independently

**Files:** `src/lib/editor/codemirror/quillmark-decorator.ts:145`, `src/lib/editor/codemirror/quillmark-folding.ts:51`

Both plugins call `findMetadataBlocks(doc)` on every doc update. The decorator then builds decorations; the folding plugin then computes fold ranges. For a large document this parses the block structure twice per keystroke.

**Suggested fix:** Make the decorator plugin publish a `blocks` field into a CodeMirror `StateField`; have folding consume that field. No new abstraction — CodeMirror's facet / state-field system is built for exactly this case. Perf + one fewer place to keep the block shape in sync.

---

## M3. Block `startIndex`/`endIndex` invalidated after first mutation

**File:** `src/lib/editor/editorState.svelte.ts:280-381`

Parse path: `content` → `parseBlocks()` → `Block[]` with accurate byte positions.
Mutate-then-serialize path: mutation updates a card field → `toDocumentString()` → `rebuildBlocksFromState()` reconstructs blocks from scratch. The rebuilt blocks have byte indices that correspond to the new string, but callers reading indices that were captured before the mutation will see stale numbers.

Today this doesn't bite because no caller keys on `block.startIndex` across a mutation. The smell is that the contract is undocumented — the field looks authoritative at any point in time.

**Suggested fix:** Either
1. Document at the `Block` type: "startIndex/endIndex are only valid relative to the string that produced this block; do not compare across mutations." Then consider dropping them from the `$state` if no UI reads them, or
2. Separate the parse-time positional data from the mutation-time data — the latter doesn't need indices at all.

---

## M4. `parseMarkdown` swallows failures to fallback paragraph

**File:** `src/lib/editor/prosemirror/parser.ts:93-111`

```ts
try { return quillmarkParser.parse(normalized); }
catch (error) {
  console.error('Failed to parse markdown, falling back to plain text:', error);
  return quillmarkSchema.node('doc', null, [
    quillmarkSchema.node('paragraph', null, ...)
  ]);
}
```

The fallback is the right default — we never want the editor to refuse to load — but the error lands only in `console.error`. Any parse failure silently becomes a wall of plaintext that the user may then save, losing structure.

**Suggested fix:** Emit a typed diagnostic to the surrounding store (`editorState` already has a `diagnostics: ParseDiagnostic[]`). The UI can then show "this document had structural issues" and offer a non-destructive resync.

---

## M5. Re-exports from `editorState.svelte.ts` muddle the public API

**File:** `src/lib/editor/editorState.svelte.ts:26-31`

```ts
export { isEmptyValue };
export type { ParseDiagnostic };
export type { Block };
```

`isEmptyValue` is from `$lib/parsing`; `ParseDiagnostic` and `Block` likewise. The re-exports exist because once upon a time callers imported from here. Grep shows zero external consumers depend on this module for those names.

**Suggested fix:** Delete the re-exports. Consumers import from `$lib/parsing` directly. If a common barrel is wanted, add `src/lib/editor/types.ts` — don't overload the store file.

---

## L1. List commands exported but only two used outside the keymap

**File:** `src/lib/editor/prosemirror/list-commands.ts:181-659`

11 commands exported; only `toggleBulletList` and `toggleOrderedList` are imported outside `keymap.ts`. The rest being exported is fine (they're bound in the keymap which imports by name), but the `index.ts` at `src/lib/editor/prosemirror/index.ts` should not re-export them and expose internal choreography as public API. Quick audit: trim the `prosemirror/index.ts` re-export list to what the editor components actually call.

---

## L2. `prosemirror/serializer.ts` — `as any` access to `MarkdownSerializerState`

Already captured in [`prose/proposals/simplifications/prosemirror-serializer-types.md`](../../proposals/simplifications/prosemirror-serializer-types.md). Landing that proposal also cleans up the `any` count.

---

## L3. Legacy card-ID migration is a live feature, not tech debt

**File:** `src/lib/editor/editorState.svelte.ts:224-235` (warning diagnostic for un-ided legacy cards) and `src/lib/editor/preprocess.ts:113-121` (assigns UUIDs on load).

Flagged only to forestall its deletion: this branch is how existing documents without `PRESENTATION.id` keep working. Keep the code, keep the diagnostic, maybe add a comment referencing the deprecation horizon if one exists.

---

## L4. `src/lib/editor/shared/placeholder-patterns.ts` — minimal, fine

18 LOC defining a regex and a type. No action. Noted because `shared/` directories often drift into grab-bags; this one hasn't.

---

## Summary table

| ID | Severity | File | One-line |
|---|---|---|---|
| H1 | H | `editorState.svelte.ts` | Split parse/serialize out of the store file |
| M1 | M | `editorState.svelte.ts` | Factor YAML key reordering; kill 3× `any` casts |
| M2 | M | `codemirror/quillmark-decorator.ts` + `quillmark-folding.ts` | Share block index via CM state field |
| M3 | M | `editorState.svelte.ts` | Document or remove post-mutation block indices |
| M4 | M | `prosemirror/parser.ts` | Surface parse failures as diagnostics |
| M5 | M | `editorState.svelte.ts` | Delete unused re-exports |
| L1 | L | `prosemirror/list-commands.ts` + `index.ts` | Trim public re-export surface |
| L2 | L | `prosemirror/serializer.ts` | See existing proposal |
| L3 | L | `editorState.svelte.ts:224-235` + `preprocess.ts` | Keep legacy id migration; document horizon |
| L4 | L | `editor/shared/*` | No action |
