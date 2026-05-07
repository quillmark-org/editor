# VisualEditor Parsing & Merge Logic Review

**Executive Summary:** The subsystem is well-structured (~7,100 LOC + 5,874 LOC tests) with identified, fixable issues. A full rewrite is not justified; a targeted 4-phase cascade refactor yields ~900 LOC deletion and eliminates most red flags.

---

## System Architecture

**Core layers:**

1. **Markdown parsing** (`core-parser.ts`, `document-regions.ts`) — markdown-it + token-based region splitting
2. **YAML manipulation** (`yaml-utils.ts`, `yaml-document.ts`, `yaml-merge.ts`) — low-level ops, AST-based updates, dirty-field merge
3. **State management** (`editorState.svelte.ts`) — typed store + reconciliation
4. **Component integration** (`VisualEditor.svelte`) — coordinate editor flows

Total: **~7,100 LOC** across 20+ files.

---

## Strengths Worth Keeping

### 1. Token-based region parsing (`document-regions.ts:85-133`)

Uses markdown-it's token stream (not regex) to find delimited blocks. Robust against nested fences and edge cases. **DO NOT REWRITE.**

### 2. AST-based YAML updates with comment preservation (`yaml-document.ts:149-267`)

The 120-line `applyDirtyFieldsToDocument` preserves comments by mutating nodes in-place rather than replacing. This is non-trivial and well-tested (607 LOC tests). **CORE VALUE — keep this approach.**

### 3. Schema-aware dirty-field merge (`yaml-merge.ts:25-187`)

Type-specific empty-value logic (`isEmptyValue`): strings trim empty, arrays only if length=0, numbers treat 0 as valid. Preserves clean fields and non-schema fields from original. Well-tested (451 LOC). **KEEP THE LOGIC — refactor the plumbing.**

### 4. Test coverage

~5,874 LOC of tests across parsing, editor state, ProseMirror, reconciliation. Good coverage of round-trip fidelity, comment preservation, type-specific merge cases. High ratio (83% test LOC).

---

## Critical Issues

### 1. Reconciliation algorithm is brittle (`editorState.svelte.ts:73-212`)

**Issue:** Card identity is rediscovered on each parse via a "pool of unused" matching strategy:

- Exact card type match → use old ID
- Multiple matches → score by `contentSimilarity` (exact match = 100, length diff <5 = 10, else 0)
- No match → generate deterministic hash ID

**Problem:** `contentSimilarity` is cartoonishly naive. Two freshly added indorsement cards with nearly identical bodies will score equally; greedy matching could assign either ID to either card, risking silent data mixups.

**Also:** Three ID strategies coexist (hash, `Date.now()+random`, previousState match). Code admits "Better logic can be added later" (line 80).

**Impact:** Users can see card data swap when editing duplicate-type cards.

**Fix:** Persist ID in metadata; read on parse; no reconciliation needed. See Phase 1.

---

### 2. Dual state for metadata causes sync drift (`editorState.svelte.ts:393-405`)

**Issue:** Each `CardState` holds both `metadata` (object) and `metadataRaw` (string). Past bug (`[REMEDIATION] Fix 3.1`) was drift between them. Current fix: parse raw on every update.

**Problem:** Three representations (object, string, dirty-fields set) need constant sync. Still a foot-gun.

**Impact:** Risk of corrupted metadata if sync is missed in a new code path.

**Fix:** AST is the single source of truth. Derive parsed view; no parallel storage. See Phase 3.

---

### 3. Silent YAML parse failures leak data (`yaml-utils.ts:131-137, yaml-document.ts:110-112, document-regions.ts:287-290`)

**Issue:**

- `parseYamlContent` returns `{}` on parse error, no error logged
- `updateYamlDocument` returns source unchanged on parse errors, preventing subsequent fixes
- `combineBodySections` silently drops cards with no metadata

**Problem:** User has no visibility into data loss. Corrupted metadata is replaced without signal.

**Impact:** Data loss, silent corruption, difficult debugging.

**Fix:** Surface `ParseDiagnostic[]` channel. See Phase 0.2.

---

### 4. Comment preservation has edge cases (`yaml-document.ts:200-239`)

**Issue:** Deep equality check uses `JSON.stringify` comparison, which is:

- Key-order dependent
- Loses `undefined` vs missing distinction
- Doesn't handle tag changes correctly

**Problem:** False negatives in "did value change?" detection can cause comment loss.

**Impact:** Rare but real — comments are lost in edge cases.

**Fix:** Remove when AST is the single source (Phase 3). Use yaml package's built-in equality until then.

---

### 5. No transaction/batch semantics

**Issue:** Each state mutation (`updateCardMetadata`, `updatePrimaryBody`, etc.) is immediate. No rollback or atomicity.

**Problem:** If multiple updates fail partway, state is inconsistent.

**Impact:** Rare in practice (form submission is atomic), but architectural smell.

**Fix:** Addressed implicitly by moving to AST mutation (Phase 3). Single update = single AST walk = atomic.

---

## Moderate Issues

### 6. Regex-based CARD/QUILL extraction (`yaml-utils.ts:53, 79`)

**Pattern:** `/^CARD:\s*["']?(${IDENTIFIER_STR})["']?/m`

**Problem:** Works but fragile if YAML has comments, indentation, or quoted values that don't match the regex.

**Fix:** Use full YAML parsing (expensive) or phase into AST reads (Phase 2-3).

---

### 7. Dirty field type inference (`yaml-merge.ts:146-149`)

**Issue:** If schema is missing, type inferred from value (`typeof` or `Array.isArray`). Not robust for nested structures.

**Problem:** Empty-value detection could fail for complex types.

**Fix:** Require schema for dirty-field logic, or default conservatively. Minor — schema is almost always present.

---

### 8. Table serialization loses cell formatting (`prosemirror/serializer.ts:57`)

**Issue:** Uses `textContent` for cells, discarding bold/italic within cells.

**Problem:** Table cell formatting silently lost during serialization.

**Fix:** Recursively serialize cell content. Outside scope of this review but worth flagging.

---

### 9. Effect re-initialization guard is fragile (`VisualEditor.svelte:130-162`)

**Issue:** Uses `isInitializing` flag + `queueMicrotask()` to prevent re-init loops. Classic effect-fighting pattern.

**Problem:** Suggests data flow isn't fully unidirectional. Fragile if timing changes.

**Fix:** Upstream dedup (skip emission if output == last output). See Phase 0.3.

---

## File-by-file risk assessment

| File                    | LOC | Risk         | Why                                                           |
| ----------------------- | --- | ------------ | ------------------------------------------------------------- |
| `editorState.svelte.ts` | 523 | **HIGH**     | Reconciliation + dual state + three ID strategies             |
| `yaml-document.ts`      | 267 | **MODERATE** | Comment preservation edge cases + malformed YAML pass-through |
| `yaml-merge.ts`         | 187 | **LOW**      | Solid logic; only used via one call site                      |
| `document-regions.ts`   | 320 | **LOW**      | Token-based, robust; no regex fragility                       |
| `yaml-utils.ts`         | 226 | **MODERATE** | Regex CARD/QUILL extraction; silent parse failures            |
| `core-parser.ts`        | 146 | **LOW**      | Straightforward markdown-it config                            |
| `VisualEditor.svelte`   | 306 | **MODERATE** | Re-init guard; silent card lookup failures                    |
| `preprocess.ts`         | 158 | **LOW**      | Straightforward; tested                                       |

---

## Round-trip fidelity status

**Current state:**

- Parse → Serialize → Parse: byte-exact in most cases (determinism.test.ts passes)
- Comment preservation: AST-based approach survives for frontmatter/metadata
- Markdown formatting: ProseMirror round-trips correctly except table cells

**Known fidelity gaps:**

- Inline metadata in table cells (edge case)
- HTML comments stripped on load (expected; not preserved during edit)
- YAML formatting normalized on write (safe string scalars, block style)

---

## Why not a total rewrite?

A rewrite would:

- **Lose:** AST comment preservation (hard to reimlement), token-based parsing robustness, schema-aware empty-value logic, 5.9k LOC of tested behavior
- **Gain:** Fewer files, but the core problems (reconciliation, dual state, silent failures) would need to be solved again
- **Risk:** New bugs in round-trip fidelity, comment preservation, schema interaction

**Better path:** 4-phase cascade refactor that keeps high-value parts, eliminates ~900 LOC of plumbing, and surfaces silent failures.

---

## Recommendation

**Do not rewrite. Implement the 4-phase cascade plan** (`parsing-simplification-plan.md`):

- **Phase 0** (1-2 days): Safety nets — fidelity fixtures, error surfacing, effect guard fix
- **Phase 1** (2-3 days): Persisted card IDs — kills reconciliation + 3 ID strategies
- **Phase 2** (3-4 days): Uniform block model — collapses 4 types to 1, pure internal refactor
- **Phase 3** (5-7 days): AST as single truth — kills metadata dual state + 187 LOC merge plumbing
- **Phase 4** (1 day): Cleanup — remove dead code

**Total:** ~13-17 days. Phases 0-2 alone (~7-9 days) yield most stability. Each phase is independently mergeable.

---

## Test coverage summary

| File                              | LOC    | Focus                                                                       |
| --------------------------------- | ------ | --------------------------------------------------------------------------- |
| `yaml-utils.test.ts`              | 182    | YAML parsing, serialization, wrapping                                       |
| `yaml-merge.test.ts`              | 451    | **Excellent:** type-specific empty logic, quill preservation, deep equality |
| `yaml-document.test.ts`           | 607    | **Excellent:** AST updates, comment preservation, malformed YAML            |
| `document-regions.test.ts`        | 237    | Document splitting, card block parsing                                      |
| `editorState.test.ts`             | 567    | Parse/serialize round-trip, card ops, dirty tracking                        |
| `reconciliation.test.ts`          | 153    | Card ID matching, reordering, new-card detection                            |
| `preprocess.test.ts`              | 279    | Version repair, comment stripping, name init                                |
| Other (PM, list/table cmds, etc.) | 1,400+ | Extensive coverage                                                          |

**Total:** 5,874 LOC tests. Ratio: 83% test LOC / impl LOC (high).

**Gaps:**

- No integration tests of full VisualEditor → save → reload cycle
- Limited edge-case tests for duplicate-type card matching
- No performance tests for large documents
