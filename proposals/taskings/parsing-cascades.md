# Simplification Cascades in the Parsing Subsystem

## Core Insight

Three cascades, stacked, eliminate ~900 LOC of implementation + most identified red flags. **One powerful abstraction > ten clever hacks.**

---

## Cascade 1: "A document is an ordered list of delimited blocks"

### Current state (fragmented)

Four types represent nearly the same thing:

| Type              | Location                    | Represents                            | Problem                                    |
| ----------------- | --------------------------- | ------------------------------------- | ------------------------------------------ |
| `DocumentRegions` | `document-regions.ts:40-45` | `{frontMatter, body}`                 | Splits document into two parts arbitrarily |
| `BodySection`     | `document-regions.ts:64-77` | One section of body (primary or card) | Frontmatter forced into separate path      |
| `CardBlock`       | `document-regions.ts:50-59` | A YAML card + its body span           | Doesn't represent frontmatter              |
| `DelimitedBlock`  | `document-regions.ts:21-27` | A `---`-delimited block               | Intermediate type, not exposed to state    |

All represent the same concept: a YAML block + its body + its position.

### The cascade

**Insight:** Frontmatter isn't special. It's the first `---`-delimited block when it has no `CARD:` tag. Everything else is a card.

**Unification:**

```ts
type Block =
	| { kind: 'yaml'; source: string; startIndex: number; endIndex: number; cardType?: string }
	| { kind: 'prose'; source: string; startIndex: number; endIndex: number };

type Document = Block[];
```

Frontmatter = `blocks[0]` when `blocks[0].cardType === undefined`.

### What eliminates (by file)

| Deleted                                                | LOC  | Why                                         |
| ------------------------------------------------------ | ---- | ------------------------------------------- |
| `DocumentRegions` type                                 | 6    | Replaced by `Block[]`                       |
| `parseDocumentRegions`                                 | 20   | Collapsed into single `parseBlocks`         |
| `combineDocumentRegions`                               | 10   | `blocks.map(b => b.source).join('')`        |
| `BodySection` type                                     | 15   | Merged into `Block`                         |
| `parseBodySections`                                    | 65   | Subsumed by `parseBlocks`                   |
| `combineBodySections`                                  | 25   | Trivial `join`                              |
| `CardBlock` type                                       | 12   | Merged into `Block`                         |
| `parseCardBlocks`                                      | 20   | Subsumed by `parseBlocks`                   |
| `appendCardSectionToBody`                              | 20   | Special-case CARD-prefix logic inlined once |
| `hasFrontMatter`                                       | 5    | `state.blocks[0].cardType === undefined`    |
| `updateCardBlock`                                      | 5    | Inline in `setBlockSource`                  |
| `wrapYamlContent` calls                                | 8    | Centralized on read/write boundary          |
| `getDocumentDiscriminator` logic in yaml-document.ts   | 12   | Remove; discriminator is data-driven        |
| Corresponding tests (~40% of document-regions.test.ts) | ~100 | Tests for deleted APIs                      |

**Net:** ~200 LOC deleted. More importantly: one mental model instead of four.

### Benefits

- **Uniformity:** All blocks are equal. No special "frontmatter case" branches throughout the codebase.
- **Composability:** Code that walks blocks doesn't care if it's inspecting frontmatter or a card.
- **Serialization simplicity:** Document → string is just join; no frontmatter+body logic.

---

## Cascade 2: "Card identity is a property the document stores, not something the editor rediscovers"

### Current state (three ID strategies)

```ts
// Strategy A: Hash-based (legacy)
function createDeterministicCardId(cardType, metadataRaw, body, index, usedIds): string
  → hash = (hash * 33) ^ charCode
  → 'card-' + hashString(...) + '-' + index

// Strategy B: Timestamp + random (new cards)
export class EditorStateStore {
  addCard(index, id?) {
    id: id ?? `card-${Date.now()}-${Math.random()...}`
  }
}

// Strategy C: Reconciliation (parse → previousState)
const matchedId = findSimilarCard(previousState.cards, newCard)
  → contentSimilarity(oldBody, newBody) = 100 (exact) | 10 (length) | 0 (else)
```

**Problem:** Three schemes, two of which are heuristic. Card IDs can swap if two duplicates are similar enough.

### The cascade

**Insight:** Store the ID in the card's metadata itself (`PRESENTATION.id` or a reserved field). On parse, read it. No reconciliation needed.

**Implementation:**

```ts
// addCard: write persistent ID into metadata
addCard(index, id = generateUUID()): CardState {
  const newCard = {...}
  const yaml = `PRESENTATION:\n  id: ${id}\n...`
  updateCardMetadata(newCard.id, yaml)
}

// parseToEditorState: read ID from metadata
function parseToEditorState(document, quillName, previousState?) {
  const cards = cardSections.map(section => {
    const metadata = parseYamlContent(section.metadata)
    const id = metadata.PRESENTATION?.id ?? generateUUID() // fallback for legacy
    return { id, ...}
  })
}
```

### What eliminates

| Deleted                                                      | LOC | Why                              |
| ------------------------------------------------------------ | --- | -------------------------------- |
| `contentSimilarity`                                          | 9   | No matching needed               |
| `hashString`                                                 | 7   | No hash ID generation            |
| `createDeterministicCardId`                                  | 22  | Replaced by persistent storage   |
| Reconciliation loop (lines 138–212 in editorState.svelte.ts) | 64  | Entire concept gone              |
| `previousState` parameter to `parseToEditorState`            | 2   | Not needed                       |
| `reconciliation.test.ts`                                     | 153 | Tests for deleted reconciliation |

**Net:** ~260 LOC deleted. Eliminates entire class of bugs.

### Benefits

- **Stability:** IDs never change, never swap. Components keyed on ID stay mounted.
- **Simplicity:** No similarity scoring, no hash collisions, no previousState threading.
- **Observability:** ID is data; can inspect/audit in document source.
- **Determinism:** Parse behavior doesn't depend on similarity heuristics.

### Migration path

Extend `preprocess.ts` with a one-time ID assignment pass:

1. On load, detect cards without `PRESENTATION.id`
2. Assign persistent UUID
3. Emit diagnostic: "Document updated with persistent IDs"
4. Mark document dirty so save prompts

After one release, hash-based ID generation is dead code; remove it.

---

## Cascade 3: "The YAML AST is the single source of truth for metadata"

### Current state (three representations)

```ts
interface CardState {
	metadata: Record<string, unknown>; // Parsed object
	metadataRaw: string; // Raw YAML string
	// (implicit) dirtyCardFields: Set<string>  // What changed
}
```

Kept in sync via:

- `[REMEDIATION] Fix 3.1`: Parse metadataRaw on every update
- `updateCardMetadata` (line 393): Sync both directions
- `mergeYamlWithDirtyFields` (187 LOC): Selective merge back to raw

**Problem:** Three representations, constant sync code, past drift bugs.

### The cascade

**Insight:** Store a `yaml.Document` node. Everything is derived from it.

```ts
interface Block {
	kind: 'yaml';
	doc: yaml.Document; // Single source of truth
	source?: string; // Cached stringified output
}

// Reads: synchronous, no sync needed
const metadata = block.doc.toJS();
const fieldValue = block.doc.get('PRESENTATION')?.get('name');

// Writes: mutate the AST
function setCardField(cardId: string, path: string, value: unknown) {
	const block = state.blocks.find((b) => b.cardType === cardId);
	block.doc.set(path.split('.'), value); // Mutates in place; comments survive
	block.source = block.doc.toString();
}
```

No parallel sync, no merge phase, comments preserved automatically.

### What eliminates

| Deleted                                               | LOC              | Why                                                  |
| ----------------------------------------------------- | ---------------- | ---------------------------------------------------- |
| `CardState.metadata` field                            | (becomes getter) | Derive from doc.toJS()                               |
| `CardState.metadataRaw` field                         | —                | doc is the storage                                   |
| `dirtyFrontmatterFields` tracking                     | 1+               | Mutation is the write                                |
| `dirtyCardFields` tracking                            | 1+               | Implicit in AST mutation                             |
| `markFrontmatterFieldDirty` method                    | 5                | Not needed                                           |
| `markCardFieldDirty` method                           | 10               | Not needed                                           |
| `isDirty`, `clearDirty` methods                       | 10               | Implicit in AST state                                |
| **`yaml-merge.ts` entire file**                       | **187**          | No merge path; AST is the write path                 |
| `mergeYamlWithDirtyFields`                            | 58               | Replaced by setCardField mutation                    |
| `isEmptyValue`                                        | 22               | Becomes utility at form boundary (not orchestration) |
| `deepEqual`                                           | 35               | Not needed (AST equality is reference)               |
| `RESERVED_FIELDS` logic                               | 5                | Managed in setCardField                              |
| `applyDirtyFieldsToDocument` in yaml-document.ts      | ~120             | Entire approach replaced                             |
| `updateYamlDocument` dirty-field path (lines 118–124) | 10               | No merge needed                                      |
| `enforceStringScalars` recursive descent              | ~40              | Hoist to single serialize pass                       |
| `updateCardMetadata` remediation code (lines 393–405) | 13               | Sync not needed                                      |
| `yaml-merge.test.ts`                                  | ~451             | Tests for deleted merge logic                        |
| `yaml-document.test.ts` dirty-field cases             | ~200             | Tests for deleted merge path                         |

**Net:** ~1,100 LOC deleted.

### What stays

- `isEmptyValue`: Schema-aware logic ("is this field empty per its type?"). Becomes a utility the form boundary calls on each field write, not orchestration plumbing.
- Comment-preservation logic in `yaml-document.ts`: Test-verified AST mutation strategy. This is the high-value part.
- Token-based parsing in `document-regions.ts`: Robust, independent.

### Benefits

- **Single source of truth:** No sync code, no drift bugs.
- **Automatic comment preservation:** yaml.Document handles it; no special cases.
- **Type-safe mutations:** Direct AST walk (can type-check with TypeScript if eemeli adds it).
- **Simpler form boundary:** Wizard doesn't return `{formData, dirtyFields}`; it calls `setCardField` as it goes.

  Or (compat shim): wizard still returns form data, but boundary translates to field-by-field mutations. Easier than current merge logic.

### Implementation strategy

**Phase 3A (internal):** Move AST to the storage layer.

- Each `Block.yaml` carries a `Document` node
- Reads derive via `.toJS()`
- Writes via a new `setBlockField(blockId, path, value)` method

**Phase 3B (boundary):** Migrate wizard forms.

- Option 1 (preferred): Change wizard to call `setBlockField` on each field edit. Removes `{formData, dirtyFields}` parameter entirely.
- Option 2 (compat shim): Wizard still returns data; boundary translates to field mutations. Keeps caller code unchanged while internal plumbing simplifies.

Start with Option 2 to minimize blast radius; migrate to Option 1 opportunistically.

---

## Combined cascade: Unified model

Under all three cascades:

```ts
type Block = { kind: 'yaml' | 'prose'; doc?: Document; source: string; id?: string };
type EditorState = { blocks: Block[] };
```

- **One block type** (Cascade 1) representing frontmatter and cards uniformly
- **Persistent ID in metadata** (Cascade 2) — no reconciliation
- **AST as storage** (Cascade 3) — single representation

| Component                                                             | Before                          | After        |
| --------------------------------------------------------------------- | ------------------------------- | ------------ |
| Block types (DocumentRegions, BodySection, CardBlock, DelimitedBlock) | 4                               | 1            |
| Card ID strategies                                                    | 3                               | 1            |
| Metadata representations                                              | 3                               | 1 (AST node) |
| Merge/reconciliation phases                                           | 2 (reconcile IDs, merge fields) | 0            |
| Dirty-field tracking                                                  | 2 fields, 4 methods             | 0            |

---

## Metrics

### LOC eliminated

| Cascade            | Files                                                        | LOC        | Tests    |
| ------------------ | ------------------------------------------------------------ | ---------- | -------- |
| 1 (uniform blocks) | document-regions.ts, yaml-document.ts, editorState.svelte.ts | ~200       | ~100     |
| 2 (persisted IDs)  | editorState.svelte.ts                                        | ~260       | ~153     |
| 3 (AST as truth)   | yaml-merge.ts, yaml-document.ts, editorState.svelte.ts       | ~1,100     | ~650     |
| **Total**          | **6 core files**                                             | **~1,560** | **~900** |

### Complexity reduction

| Metric                            | Before | After | Reduction |
| --------------------------------- | ------ | ----- | --------- |
| Distinct block/region types       | 4      | 1     | 75%       |
| Card ID strategies                | 3      | 1     | 67%       |
| Metadata representations per card | 3      | 1     | 67%       |
| Reconciliation/merge phases       | 2      | 0     | 100%      |
| Silent-failure sites              | 3      | 0     | 100%      |

---

## Risk assessment

### Low risk

- **Cascade 1 (uniform blocks):** Pure internal refactor. No external API change. Changes only parsing internal types.
- **Cascade 2 (persisted IDs):** Self-contained. Only changes where IDs come from. Non-invasive migration.

### High risk

- **Cascade 3 (AST as truth):** Changes boundary to wizard forms. Requires careful phase-in strategy (compat shim first).

### Mitigations

1. **Fidelity corpus from Phase 0:** Real documents must parse → serialize → parse with bit-exact second round. Catches regressions at PR time.
2. **Checkpoint testing:** Each cascade has specific new tests. Ensure they pass before moving to next.
3. **Compat shim for Phase 3:** Wizard still returns `{formData, dirtyFields}` initially. Boundary translates to mutations. Allows staged migration of callers.

---

## Why these are cascades, not independent fixes

- **Cascade 1 enables Cascade 3:** You need _one_ block type before giving it _one_ AST.
- **Cascade 2 independent:** Can land anytime; best to land early (clears the decks before structural refactors).
- **Cascade 3 requires 1 + 2:** Simpler metadata model (AST) + no reconciliation (IDs persisted) = no prior-state logic to refactor.

Landing them out of order works but slightly messier:

- Do 1, then 2, then 3: Clean, logical, minimal intermediate state.
- Do 2, then 1, then 3: Works; no extra complexity.
- Do 3 first: Have to carry reconciliation/dirty-field logic into the new AST model (extra work).

**Recommended order:** 2 → 1 → 3. Simplest first, structural next, invasive last.
