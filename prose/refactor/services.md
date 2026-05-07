# Services / DB Layer Refactor Audit

Scope: `src/lib/server/services/**` and `src/lib/server/db/**`.

---

## Provider indirection

**Category:** over-engineered · **Leverage:** high

**Locations.**
- `src/lib/server/services/documents/document-provider.ts:1-71`
- `src/lib/server/services/templates/template-provider.ts:1-15`

**What.** Both directories have a "provider" layer between the route and the
Drizzle service. There is exactly one implementation of each service
(`DrizzleDocumentService`, `DrizzleTemplateLibraryService`), and the factory
never selects between implementations — it just news-up the one class and
caches the singleton.

The documents side is worse:

- `getDocumentService()` returns `Promise<DocumentServiceContract>` even
  though instantiation is synchronous. Every caller awaits for no reason.
- A parallel `documentService` object (lines 21-71) re-wraps each method so
  existing call sites can keep using a plain object. Two APIs for the same
  functionality coexist in the same file.
- `documentService.createDocument` accepts either `user_id` or `owner_id`
  with a runtime fallback (lines 22-37) — defensive logic for a branch no
  real caller exercises.

**Why it smells.** The indirection earns nothing today:

- There is no test double swapping; tests that need one inject the class
  directly.
- There is no feature-flagged alternate implementation.
- Every route handler opens with `const service = getX()`, and route files
  have become a catalog of duplicated factory calls (24 template factory
  invocations across the API layer — see
  [api § Redundant service-factory calls](./api.md#redundant-service-factory-calls-per-request)).

**Direction.**
1. Delete `document-provider.ts` and `template-provider.ts`.
2. Export a single singleton from each service module: `export const
   documentService = new DrizzleDocumentService();`.
3. Remove the async factory shape — constructing the class is synchronous.
4. Remove `user_id`/`owner_id` fallback in `createDocument`. Callers already
   pass `user_id` uniformly; normalize to `owner_id` at service boundary and
   update the two call sites.
5. If future mocking is needed, pass dependencies into the class constructor
   rather than swapping at the factory.

This change cascades into the API layer: every route stops writing `const
service = getTemplateLibraryService();` and imports the singleton directly.

**Quillmark shares the smell.** `QuillmarkServerService` uses a `getInstance()`
static plus a default singleton export (`src/lib/server/services/quillmark/service.ts:24-38`
with the singleton at line 112). Three different ways to reach a service across
the three service modules. Once the documents/templates providers collapse,
remove `getInstance()` too and export a single module-level
`quillmarkServerService`. Node module caching is the singleton.

---

## Duplicated try/catch → `rethrowUnless(mapDrizzleError)` envelope

**Category:** redundant · **Leverage:** medium

**Location:** Every public method in both services repeats the same shape:

```ts
async methodName(params) {
  try {
    // actual work
  } catch (error) {
    rethrowUnless(error, AppError, mapDrizzleError);
  }
}
```

Roughly 18+ occurrences across
`src/lib/server/services/documents/document-drizzle-service.ts` and
`src/lib/server/services/templates/template-drizzle-service.ts`.

**Direction.** Wrap once with a small HOF:

```ts
function withDrizzleErrors<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  return async (...args) => {
    try { return await fn(...args); }
    catch (error) { rethrowUnless(error, AppError, mapDrizzleError); }
  };
}
```

Or — higher leverage — install the Drizzle error mapper as a global DB query
hook if the DB client supports it, and delete the try/catch from the services
entirely. Measure the cost before taking that second step; a shared helper is
the safer first move.

---

## Parallel type definitions (DB schema ↔ service DTOs)

**Category:** redundant · **Leverage:** medium

**Locations.**
- `src/lib/server/db/schema.ts:322-329,331-335` — `Document`, `Template`
  inferred from Drizzle (`$inferSelect`).
- `src/lib/services/documents/types.ts` — a second `Document` shape with
  snake_case field names.
- `src/lib/server/services/templates/types.ts` — `TemplateListItem`,
  `TemplateDetail`, `TemplateListResult`.

**Why it smells.** Two sources of truth per entity. Mappers
(`mapToDocument`, `mapToListItem`) exist solely to translate `camelCase`
Drizzle types to `snake_case` service DTOs, and every schema change must be
made twice. Adding a column is a three-file PR before touching any call site.

**Direction.**
- Decide on one casing convention and stick to it. Swapping to Drizzle's
  camelCase at the service boundary is the cheaper migration.
- Keep the schema-inferred types as canonical; derive DTOs as `Pick<...>`
  projections instead of restating fields.
- Computed fields like `is_official` belong in a helper
  (`isOfficialTemplate(ownerId)`) referenced from one place, not baked into
  the mapper.

This is a week-long refactor, not a drive-by. Scope it separately.

---

## Maintenance helpers co-located with production services

**Category:** vestigial / over-engineered · **Leverage:** low

**Locations.**
- `src/lib/server/services/templates/repair-template-db.ts` — exports
  `repairTemplateWithDb(db, params)` and `repairTemplateWithAppDb(params)`.
  Only `repairTemplateWithAppDb` is used; the generic form has no tests and
  no other callers.
- `src/lib/server/services/templates/mark-template-official-db.ts` — same
  pattern.

**Why it smells.** These are operational/admin tools invoked by cron
endpoints. They sit next to the core template service but are not part of
`TemplateLibraryServiceContract`. The generic `…WithDb` form adds type
surface (`RepairTemplateDb = NodePgDatabase<…>`) that exists only for a
hypothetical test that never wrote itself.

**Direction.**
- Collapse `repairTemplateWithAppDb` into `repairTemplateWithDb` (single
  function that takes the real `db`). Delete the generic param.
- Move both files into `src/lib/server/maintenance/` (new folder) to signal
  they are operations tools, not service business logic. The cron routes
  import from there.

---

## `updateTemplateContent` is used — *but* its edit contract is odd

**Category:** smelly · **Leverage:** low (verified correction)

**Location:** `src/lib/server/services/templates/template-drizzle-service.ts:431-492`;
called from `src/routes/api/templates/[id]/content/+server.ts:20`, exposed to
the client in `TemplateDivergenceBanner.svelte:84`.

(The first-pass services audit marked this as "likely vestigial" — that was
wrong.)

**What the smell actually is.** The method re-reads the linked fork
document, recomputes `quillRef`, and updates the template row. The contract
"take no content — go find the content by following the fork reference" is
implicit and brittle:

- If the template has no linked document, the method throws.
- The update path is completely different from `updateTemplateMetadata`,
  which accepts the fields directly.

**Direction.** Either
- Make the implicit fetch explicit: have the endpoint look up the fork
  document and pass the content in, so the service has one shape of update
  (take content, write content); or
- Document the "pull-from-fork" contract prominently and test it. Current
  callers rely on the side-effect chain without any guard rails.

No rush unless the template divergence flow changes.

---

## `applyStarInsert` helper with exactly two callers

**Category:** over-engineered · **Leverage:** low

**Location:** `src/lib/server/services/templates/template-drizzle-service.ts:79-101`,
called from `createTemplate()` and `starTemplate()`.

**Also:** the type alias `TemplateLibraryTx = Parameters<Parameters<…>[0]>[0]`
at line 34 exists *only* to type the helper's `tx` parameter.

**Why it smells.** Nine lines saved across two call sites, at the cost of a
reverse-inferred transaction type that is brittle against Drizzle version
bumps.

**Direction.** Inline at both call sites; delete the type alias. The explicit
onConflict logic reads fine in-place.

---

## Leaky coupling: templates service constructs Document DTOs

**Category:** smelly · **Leverage:** low

**Location:** `src/lib/server/services/templates/template-drizzle-service.ts:18`
imports `type { Document } from '$lib/services/documents/types'`; lines
703-712 manually construct a Document DTO inside `importTemplate()` by
destructuring Drizzle rows.

**Why it smells.** Every change to the `Document` shape must update the
documents service's mapper *and* this hidden constructor. The template
service has knowledge of document persistence internals it shouldn't need.

**Direction.** Export `mapToDocument(row)` from the documents service (or a
shared mapping module) and have `importTemplate` call it. Once the parallel
type definitions land (see above), this case disappears entirely because the
service types will derive from the schema.

---

## Swallowed errors

**Category:** smelly · **Leverage:** medium

**Locations.**
- `src/lib/server/services/metrics/index.ts:26-29,66-70` — `recordExport`
  and `recordActivity` catch and `console.error` without context (user id,
  document id, error class).
- `src/lib/server/services/quillmark/service.ts:71-79,86-108` —
  `parseDocument` and `getDatePathConfigForMarkdown` return `null` on any
  error. Callers can't distinguish "document has no QUILL frontmatter" from
  "WASM parse failed".

**Why it smells.** Both failure modes are real and legitimate (metrics should
not break a request; missing frontmatter is normal). But collapsing every
error to "silent null" or "console log" loses the information needed to
debug regressions.

**Direction.**
- Structured logging helper shared across services (same one called for
  from [api § console.error](./api.md#ad-hoc-consoleerror-in-feedback-route)).
  Always include `{ service, operation, user_id?, resource_id?, error }`.
- In Quillmark, distinguish "no frontmatter" (return null, don't log) from
  "parse exception" (return null, log warning). Callers stay unchanged; ops
  visibility improves.

---

## Hard-coded rate limits

**Category:** smelly · **Leverage:** low

**Location:** `src/lib/server/services/metrics/index.ts:10-11`.

```ts
const EXPORT_RATE_LIMIT_MAX = 10;
const EXPORT_RATE_LIMIT_WINDOW_MS = 60_000;
```

**Direction.** Move to an env-driven config (`RATE_LIMIT_EXPORT_PER_MINUTE`)
if there's any expectation of per-environment tuning. If not — leave and add
a comment saying so. The smell is the lack of a decision, not the specific
numbers.

---

## Transaction scope inconsistency

**Category:** smelly · **Leverage:** low

**Location:** `src/lib/server/services/templates/template-drizzle-service.ts`
— createTemplate (329-363), unpublishTemplate (498-535), starTemplate
(598-613), unstarTemplate (619-646), importTemplate (652-714).

**Why it smells.** `createTemplate` and `importTemplate` wrap genuinely
atomic multi-row operations in `db.transaction()` (correct). `starTemplate`
wraps two single-row writes plus a conditional, which is more easily
expressed as a single INSERT … ON CONFLICT plus a conditional UPDATE outside
a transaction — the `onConflictDoNothing` provides the needed atomicity for
the interesting half.

**Direction.** Audit each transaction boundary: if the operation can be
expressed as a single SQL statement (or two independent statements where
partial failure is fine), drop the wrapping `db.transaction(...)`. Document
the rule — "transaction only for cross-table invariants" — in a header
comment.

---

## `getPublicDocument` sits in the authenticated service

**Category:** smelly · **Leverage:** low

**Location:** `src/lib/server/services/documents/document-drizzle-service.ts:422-447`
— a single public-access method on a service otherwise entirely keyed on
`user_id`.

**Why it smells.** It has a different shape (`documentId` only, no user),
returns a different DTO (`PublicDocument`), and is not listed in
`DocumentServiceContract`. A reader skimming the class has to notice the
exception manually.

**Direction.** Either
- Promote it into the contract so it's visible, or
- Split it into `PublicDocumentReader` in a separate module. Public reads
  are a legitimately distinct concern (no auth, different caching profile,
  different error shape).

The second is the more honest fix; the first is cheaper.

---

## Inconsistent `[Templates]` logging in seed

**Category:** smelly · **Leverage:** trivial

**Location:** `src/lib/server/services/templates/seed.ts:93,153,168,175`.

**What.** Mix of `console.log`, `console.warn`, `console.error` with the
`[Templates]` prefix; no timestamps, context, or structured fields.

**Direction.** Covered by the shared structured-logger recommendation above.

---

## Findings that were false positives

One sub-agent produced the following that did not survive verification.
Documented here so future passes don't re-flag them:

- **`updateTemplateContent`** — flagged as unused. Actually used by
  `src/routes/api/templates/[id]/content/+server.ts:20` and consumed by the
  `TemplateDivergenceBanner.svelte` component. The *shape* of its contract
  is still worth revisiting (see above), but it is live code.
- **`DrizzleDocumentService` class export** — flagged as vestigial. Only
  imported by `document-provider.ts` today; becomes cleanly reachable once
  the provider layer collapses. No action needed now.
- **Service authorization checks** — flagged as "missing". Authorization is
  intentionally enforced at the route boundary by `requireAuth()` matching
  `user_id`; the services trust their inputs. Document this rule in a
  module header but don't push auth deeper.

---

## Finding count summary

- Vestigial: 1 (generic `repairTemplateWithDb`)
- Redundant: 2 (try/catch envelope, parallel DTOs)
- Over-engineered: 2 (provider indirection — absorbs the async/sync and
  `getInstance()` factory inconsistencies; `applyStarInsert`)
- Smelly: 6 (leaky Document import, swallowed errors, rate-limit constants,
  transaction scope, `getPublicDocument` placement, seed logging)
- `updateTemplateContent` contract (standalone)

Total: 12 themes; ~30 concrete locations. The provider-indirection collapse
is the single highest-leverage change in the entire audit — it is the root
cause of the factory-shape inconsistency, the defensive `user_id`/`owner_id`
fallback, and the 24 redundant factory calls in the API layer, and it deletes
code without changing runtime behavior.
