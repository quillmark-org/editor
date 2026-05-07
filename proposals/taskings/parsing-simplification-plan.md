# Implementation Plan: Parsing Subsystem Simplification

## Principle

Cascades subsume most targeted refactors. Order matters: do cheap safety work first, then land cascades from lowest-risk to highest-invasiveness. Stop between phases — each one is independently mergeable.

---

## Phase 0 — Safety nets (1-2 days)

Prerequisites that make everything downstream safer to land.

**0.1 Fidelity fixtures.** Add a corpus test: check a dozen real documents (from `src/**/fixtures` or a new `tests/fixtures/documents/`) pass `parse → serialize → parse` with byte-exact second-round equality. Checkpoint before _each_ cascade.

**0.2 Surface silent failures.** Add `ParseDiagnostic[]` return channel:

- `parseYamlContent` (`yaml-utils.ts:131-137`) — return `{data, errors}` instead of swallowing.
- `updateYamlDocument` (`yaml-document.ts:110-112`) — propagate `doc.errors` instead of returning source unchanged.
- `combineBodySections` (`document-regions.ts:287-290`) — log which cards were dropped.
- Surface on `EditorStateStore` as `store.diagnostics`; VisualEditor shows a dismissible banner.

**0.3 Fix re-init guard.** `VisualEditor.svelte:130-162` — remove `isInitializing`/`queueMicrotask` by making `onDocumentChange` skip emission when new document === last-emitted document. Pure upstream dedup; no effect fighting.

**Delete at end of phase:** nothing yet.

---

## Phase 1 — Cascade 2: Persisted Card IDs (2-3 days)

Lowest risk, highest payoff. Self-contained.

**1.1 Choose storage.** Store ID in `PRESENTATION.id` (it already exists and is a free-form namespace) or a reserved top-level `_id` key. Prefer `PRESENTATION.id`.

**1.2 Write path.** `EditorStateStore.addCard` — generate a UUID, inject into `PRESENTATION.id` via `updateYamlDocument`. Remove `Date.now()+Math.random()` ID (`editorState.svelte.ts:431`).

**1.3 Read path.** `parseToEditorState` — read ID from metadata. If missing (legacy), assign one deterministically (keep `hashString` as single legacy bridge) and mark document dirty.

**1.4 Preprocess migration.** Extend `preprocess.ts` with a one-time pass that assigns persistent IDs to unlabeled cards, emitting a diagnostic.

**Delete in this phase:**

- `contentSimilarity` (`editorState.svelte.ts:73-81`)
- `createDeterministicCardId` (after legacy migration settles — keep one release)
- `previousState` parameter and entire reconciliation loop (`editorState.svelte.ts:138-212`)
- `reconciliation.test.ts` (153 LOC) — replaced by simpler "IDs round-trip" tests

**Checkpoint:** Phase 0 fidelity fixtures must still pass. Add new test: edits to primary body do not change any card's persisted ID.

---

## Phase 2 — Cascade 1: Uniform Block Model (3-4 days)

Internal refactor only; no external API change. Prepares the ground for Phase 3.

**2.1 Introduce `Block` type.** In `document-regions.ts`:

```ts
type Block =
	| { kind: 'yaml'; source: string; startIndex: number; endIndex: number; cardType?: string }
	| { kind: 'prose'; source: string; startIndex: number; endIndex: number };
```

Frontmatter = first `yaml` block with `cardType === undefined`.

**2.2 Collapse parsers.** Replace `parseDocumentRegions` + `parseBodySections` + `parseCardBlocks` with a single `parseBlocks(document): Block[]`. `findDelimitedBlocks` becomes its internal.

**2.3 Collapse serializers.** `serialize(blocks) = blocks.map(b => b.source).join('')`. Delete `combineDocumentRegions`, `combineBodySections`, `appendCardSectionToBody`'s CARD-prefix and spacing logic.

**2.4 Update `EditorState`.** Replace `{quillName, frontmatter, frontmatterRaw, primaryBody, cards[]}` with `{blocks: Block[]}`. Add selectors: `state.frontmatterBlock`, `state.cards`, `state.proseBefore(cardId)`. Components consume selectors, not fields.

**2.5 Collapse discriminator logic.** `yaml-document.ts:45-47` — delete `getDocumentDiscriminator`. Discriminator is whatever key (`QUILL` or `CARD:<type>`) already exists in the block.

**Delete in this phase:**

- `DocumentRegions`, `BodySection`, `CardBlock`, `DelimitedBlock` types → one `Block`.
- `parseDocumentRegions`, `combineDocumentRegions`, `parseBodySections`, `combineBodySections`, `appendCardSectionToBody`.
- `hasFrontMatter`, `updateCardBlock` (trivially inline-able).
- The `targetBlock || frontmatter` branch in `updateYamlDocument:67-74`.
- ~100-150 LOC net.

**Checkpoint:** Fidelity fixtures pass. `document-regions.test.ts` shrinks substantially but coverage of block parsing stays.

---

## Phase 3 — Cascade 3: AST as Single Source of Truth (5-7 days)

Invasive. Changes the boundary to wizard forms. Do this last.

**3.1 Block owns its `Document` node.** `yaml` blocks carry a `yaml.Document` alongside `source`. `source` becomes a serializer output, not input.

**3.2 Derive reads, don't store them.** `CardState.metadata` becomes a getter (`() => block.doc.toJS()`). Remove `metadataRaw`. The `[REMEDIATION] Fix 3.1` sync code in `updateCardMetadata` (`editorState.svelte.ts:393-405`) deletes.

**3.3 Writes mutate the AST.** New API: `store.setCardField(cardId, path, value)` walks the `Document` and sets the scalar in place. Comments, tags, formatting survive automatically — that's the whole point of eemeli's `yaml`.

**3.4 Wizard form boundary.** This is the invasive part. Two options:

- **(A) Mutation-based** (preferred): wizard calls `setCardField` per edit; no `formData`/`dirtyFields` round-trip.
- **(B) Diff-based** (compat shim): keep `{formData, dirtyFields}` API, translate to field-by-field mutations at the boundary. Use if `(A)` ripples too far; revisit later.

Start with (B) to limit blast radius, then migrate callers to (A) opportunistically.

**3.5 Empty-value semantics preserved.** `isEmptyValue` is domain logic, not plumbing — keep it as a small utility the write boundary calls. Everything else in `yaml-merge.ts` dies.

**Delete in this phase:**

- `yaml-merge.ts`: `mergeYamlWithDirtyFields`, `deepEqual`, `RESERVED_FIELDS` (~150 LOC; keep `isEmptyValue`).
- `applyDirtyFieldsToDocument` in `yaml-document.ts` (~120 LOC).
- `dirtyFrontmatterFields`, `dirtyCardFields`, `markFrontmatterFieldDirty`, `markCardFieldDirty`, `isDirty`, `clearDirty` on the store.
- `JSON.stringify`-based deep-equal (`yaml-document.ts:206`).
- `CardState.metadataRaw`, `CardState.metadata` (becomes getter).
- `yaml-merge.test.ts` (451 LOC) — replaced by smaller AST-mutation tests.
- `yaml-document.test.ts` comment-preservation cases stay; dirty-field cases delete (~200 LOC).

**Checkpoint:** Fidelity fixtures pass. Comment-preservation tests pass. New tests: "editing field X preserves comment on field Y"; "clearing a string field removes it from output."

---

## Phase 4 — Cleanup (1 day)

**4.1** Delete `sanitizeCardYAML` if Phase 1-3 never trip it in the fidelity corpus (AST can't produce duplicate keys).

**4.2** Replace `extractCardType` / `extractQuillTag` regexes with AST reads from the owned `Document`. Keep regex versions only for the `parseBlocks` bootstrap (one caller).

**4.3** Remove `enforceSafeStringScalars` recursion duplication — hoist to a single pass on `doc.contents` per serialize.

---

## Ordering rationale

```
Phase 0 (safety)  →  Phase 1 (IDs)  →  Phase 2 (blocks)  →  Phase 3 (AST)  →  Phase 4
   independent        independent       pure internal      invasive          cleanup
```

- Phase 1 before Phase 3: persistent IDs let you drop reconciliation without first figuring out how to store IDs in an AST you haven't finished migrating to.
- Phase 2 before Phase 3: you want _one_ `Block` type before giving it _one_ `Document`.
- Phase 4 last: some cleanups only become obvious after the cascades settle.

---

## Expected net result

| Metric                                         | Before | After        |
| ---------------------------------------------- | ------ | ------------ |
| Impl LOC in `src/lib/parsing` + `editor` state | ~2,500 | ~1,600-1,700 |
| Test LOC (these subsystems)                    | ~3,000 | ~2,000       |
| Distinct block/region types                    | 4      | 1            |
| Card ID strategies                             | 3      | 1            |
| Metadata representations per card              | 3      | 1            |
| Silent-failure sites                           | 3      | 0            |

---

## Risks & mitigations

- **Phase 3 wizard-form blast radius** — mitigated by starting with shim (3.4B). If the shim stays longer than a release, that's fine; the cascade still lands internally.
- **Legacy documents without persisted IDs** — migration in Phase 1.4 handles; emit diagnostic so users know docs got rewritten.
- **Fidelity regressions during Phase 2** — fixture corpus from Phase 0 catches them at PR time.
- **Scope creep** — each phase is a separate PR with its own checkpoint. Stop if priorities shift; earlier phases stand alone.

---

## Budget

~13-17 engineer-days end-to-end. Phase 0-2 alone (~7-9 days) yields most of the stability improvement; Phase 3 is the deletion jackpot but also the highest risk.

---

## Related analysis

See `parsing-review.md` for:

- Detailed red flag enumeration (reconciliation brittleness, silent YAML failures, comment preservation edge cases)
- File-by-file surface area (7,100+ LOC implementation, 5,874 LOC tests)
- Why this beats a total rewrite (keeps high-value parts: AST comment preservation, token-based parsing, schema-aware dirty merge)

See `parsing-cascades.md` for:

- Detailed cascade mechanics
- How "document = ordered list of YAML blocks" unifies 4 overlapping type systems
- How "identity is stored, not rediscovered" eliminates reconciliation entirely
- How "AST is single source of truth" kills 187 LOC of merge plumbing
