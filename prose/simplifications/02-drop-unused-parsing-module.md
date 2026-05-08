# 02 — Drop the unused `parsing/document-repairs.ts` + date-paths module

## Why it matters

`src/lib/parsing/document-repairs.ts` (286 lines), `src/lib/parsing/quill-schema-date-paths.ts` (57 lines), and `src/lib/parsing/document-repairs.test.ts` exist to convert legacy date strings (e.g. `"7 Jan 25"` → `"2025-01-07"`) on document load. **Nothing in this codebase calls them.** They are reachable only through `parsing/index.ts`, which is itself never re-exported from `lib/index.ts`, so they cannot reach a consumer either.

This is a self-contained dead module — pure deletion, no risk.

## Evidence

```
$ grep -rn "runClientDocumentRepairs\|CLIENT_DOCUMENT_REPAIR\|repairDateScalar\|repairLegacyDates" \
       src --include="*.ts" --include="*.svelte" \
       | grep -v "document-repairs"
(no output)

$ grep -rn "QuillSchemaDatePaths\|collectDatePaths" \
       src --include="*.ts" --include="*.svelte" \
       | grep -v "quill-schema-date-paths.ts"
src/lib/parsing/document-repairs.ts:10:import type { QuillSchemaDatePaths } from './quill-schema-date-paths';
src/lib/parsing/document-repairs.ts:29:	datePaths?: QuillSchemaDatePaths | null;
src/lib/parsing/document-repairs.ts:32:export type { QuillSchemaDatePaths };
src/lib/parsing/document-repairs.ts:36:	datePaths: QuillSchemaDatePaths | null;
```

Only `document-repairs.ts` itself uses `quill-schema-date-paths.ts`. And:

```
$ grep -rn "from '\$lib/parsing'" src --include="*.ts" --include="*.svelte"
src/lib/editor/codemirror/quillmark-patterns.ts:2:import { FENCED_CODE_OPEN_PATTERN, createClosingFencePattern, IDENTIFIER_STR } from '$lib/parsing';
```

The only real importer of `$lib/parsing` is the codemirror layer pulling three regex helpers from `parsing/patterns.ts`. The rest of `parsing/` is inert.

`src/lib/index.ts` does not export anything from `parsing/`. So even external consumers cannot reach these helpers.

Notable internal duplication: `repairDateScalar` reimplements ISO-date validation (`isValidIsoCalendarDate`) which is also implemented in `src/lib/components/wizard/fields/DateField.svelte:33-41`. Removing this module also removes one copy.

## What to delete

- `src/lib/parsing/document-repairs.ts` (286 lines)
- `src/lib/parsing/document-repairs.test.ts`
- `src/lib/parsing/quill-schema-date-paths.ts` (57 lines)
- All exports from `src/lib/parsing/index.ts` except the three `patterns.ts` helpers

After this, `src/lib/parsing/index.ts` collapses to:

```ts
export { FENCED_CODE_OPEN_PATTERN, createClosingFencePattern, IDENTIFIER_STR } from './patterns';
```

The `patterns.ts` helpers are only consumed by `editor/codemirror/quillmark-patterns.ts`, so the whole `parsing/` directory could even fold into `editor/codemirror/` if you go further. Not necessary for this proposal.

## Risk / verification

- `npm run check`: should pass.
- `npm test`: the only test in `parsing/` is `document-repairs.test.ts`, which is being deleted with the module. No remaining tests depend on these helpers.
- Search for stragglers: `grep -r "ClientDocumentRepairId\|RunClientDocumentRepairsResult\|datePaths" src` should return nothing after deletion.
- This module was likely retained "in case a consumer needs it" during the wasm migration. The wasm `Document` API now handles date validation directly via field types, so client-side repair is no longer needed.

## Cascade

- Eliminates one full subdirectory (3 files) and ~340 lines of code + tests.
- Removes one copy of `isValidIsoCalendarDate` (the other lives in `DateField.svelte`).
- After this and #03, `parsing/` shrinks to one tiny `patterns.ts` file that could be inlined into the codemirror layer.
