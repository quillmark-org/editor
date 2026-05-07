# Architecture Review (2026-03-26)

## Scope and approach

This review focused on maintainability risks, brittle coupling points, and patterns that are likely to become expensive as feature count grows. The pass was limited to architectural seams (routing, stores, service boundaries, and persistence integration), not UI polish or naming.

## High-priority findings

### 1) Bootstrap side-effects in `hooks.server.ts` create hidden startup coupling

`src/hooks.server.ts` executes startup logic at module evaluation time (`cron.schedule(...)` and `await syncOfficialTemplates()`), which means request-pipeline code is also acting as application bootstrap. This couples request handling to deployment lifecycle assumptions and can be brittle in environments with frequent cold starts or parallel workers.

**Why this is risky**
- Side effects run when the module is imported, not from an explicit app-init phase.
- Startup synchronization (`await syncOfficialTemplates()`) can delay first-request availability.
- Cron scheduling in request-hook modules can be duplicated across multiple worker instances.

**Recommendation**
- Move startup tasks into explicit bootstrap modules with idempotent guards.
- Keep `hooks.server.ts` focused on per-request middleware composition.
- For scheduled jobs, prefer deployment-native schedulers (or leader-election/lock-based scheduling if app-managed).

---

### 2) `+page.svelte` acts as a page-level “god orchestrator”

`src/routes/+page.svelte` currently coordinates auth-mode branching, document initialization, fork-from-url flows, modal state machines, export tracking, and download logic in one component.

**Why this is risky**
- High cognitive load and broad change surface for unrelated edits.
- UI regressions become more likely because behavior is cross-wired in one script block.
- Harder to test behavior in isolation (feature logic is not encapsulated in composable modules).

**Recommendation**
- Extract page orchestration into composable feature modules/hooks:
  - `useDocumentInitialization()`
  - `useForkFlow()`
  - `useExportActions()`
  - `useModalRouting()`
- Keep `+page.svelte` as composition + wiring only.

---

### 3) `DocumentStore` is carrying too many responsibilities

`src/lib/stores/documents.svelte.ts` combines state container concerns with auth-state awareness, persistence strategy selection, network fetching, optimistic flow control, auto-save behavior, and session-expiry reactions.

**Why this is risky**
- Store behavior is tightly coupled to API/client details.
- Increases chance of accidental side effects when changing one feature.
- Makes unit testing expensive because state + IO + policy logic are intertwined.

**Recommendation**
- Split into layered modules:
  - `DocumentState` (pure state transitions)
  - `DocumentRepository` (cloud/local IO abstraction)
  - `DocumentSessionPolicy` (auth/source routing rules)
- Keep the Svelte store as a thin façade over these abstractions.

---

### 4) Template library service is a large multi-purpose class

`src/lib/server/services/templates/template-drizzle-service.ts` is a large class containing query composition, validation rules, business policy, and data-shaping logic.

**Why this is risky**
- High blast radius: one file changes for many unrelated reasons.
- Harder to reason about transactional boundaries and invariants.
- Encourages duplicated validation/policy logic across route handlers and service methods.

**Recommendation**
- Slice by use case and layer:
  - Query modules (read models)
  - Command modules (publish/update/star/import)
  - Dedicated validators/policy guards
- Keep the service as a thin coordinator over smaller units.

---

### 5) Non-deterministic card IDs in parser/reconciliation path

`src/lib/editor/editorState.svelte.ts` generates new card IDs via `Date.now()` + `Math.random()` when reconciliation misses.

**Why this is risky**
- Non-determinism complicates reproducible tests and diff debugging.
- Potential ID instability across equivalent parse runs.
- Makes deterministic replay/state-inspection harder for future collaboration features.

**Recommendation**
- Introduce deterministic ID strategy (content hash + stable sequence) with explicit collision handling.
- Reserve random IDs only for truly transient UI keys, not persisted/editor-state identities.

## Medium-priority findings

### 6) Request validation appears duplicated across API endpoints

Template and document routes (e.g., `src/routes/api/templates/+server.ts`, `src/routes/api/templates/[id]/+server.ts`, `src/routes/api/documents/+server.ts`) include repeated manual validation and coercion patterns.

**Why this is risky**
- Drift between endpoints over time.
- Hard to apply policy changes consistently.
- Boilerplate obscures endpoint intent.

**Recommendation**
- Standardize with schema-first validation (e.g., shared zod/valibot schemas per request contract).
- Centralize parse/validate helpers to keep endpoint handlers narrow.

## Suggested sequencing roadmap

1. **Stabilize boundaries first**: extract startup/bootstrap from hooks and split large orchestrators.
2. **Normalize contracts**: schema-first API validation.
3. **Refactor service/store internals**: split `DocumentStore` and template service into layered units.
4. **Determinism pass**: replace random card IDs with deterministic generation.

## Expected impact

If executed incrementally, these changes should reduce change-coupling, improve testability, and lower onboarding friction for new contributors without forcing a full rewrite.


## Simplicity filter: likely overengineering vs right-sized refactors

Given the goal to bias toward simple refactors, these are the recommendations most likely to be overengineered if implemented literally.

### Most likely to overengineer (trim these)

1. **Full “layer split” of `DocumentStore` into three new abstractions in one pass**
   - Risk: introduces many seams before there is evidence they are all needed.
   - Simpler version: extract only one boundary first — a tiny `DocumentRepository` adapter for remote/local persistence — and keep policy/state in the store until pain repeats.

2. **Full query/command/policy decomposition of template service upfront**
   - Risk: can become architecture-by-ideal, producing many files and indirection.
   - Simpler version: split only the highest-churn workflows (`publish`, `import`) into helpers; leave low-churn reads together.

3. **“Use hooks/modules for everything” on `+page.svelte`**
   - Risk: premature fragmentation and harder navigation if each module is tiny.
   - Simpler version: extract only the heaviest non-UI flow first (fork/init), keep modal/export wiring colocated until it becomes noisy again.

4. **Distributed lock/leader-election for cron as first move**
   - Risk: operational complexity may exceed current scale needs.
   - Simpler version: first move cron/sync out of `hooks.server.ts` into explicit startup utilities and gate with simple idempotency; add distributed coordination only if duplicate execution is observed.

### Keep (high value, low complexity)

1. **Move startup side effects out of `hooks.server.ts`**
   - This is a straightforward boundary cleanup with immediate clarity benefits.

2. **Centralize request validation with shared schemas/helpers**
   - Usually reduces code and drift quickly, with minimal architectural overhead.

3. **Replace `Date.now() + Math.random()` IDs for persisted editor entities**
   - Determinism improves debugging/tests; implementation can be small (stable hash + per-document increment).

## Simplicity-first implementation plan (recommended)

1. **Do-now (small PRs)**
   - Extract startup sync/cron to explicit bootstrap entry points.
   - Introduce shared API validation helpers/schemas for template endpoints first.
   - Add deterministic ID helper used only in editor persistence paths.

2. **Only-if-needed (triggered by repeated pain)**
   - Add a `DocumentRepository` boundary when a second persistence mode change lands.
   - Split template service further only when file churn or merge conflicts stay high for multiple cycles.
   - Break `+page.svelte` into additional modules only when one flow cannot be tested/reasoned about in isolation.

This preserves the spirit of the original review while keeping refactors incremental, reversible, and biased toward fewer moving parts.

## Implementation plan for Finding 2 (`+page.svelte` responsibility overload)

### Goals and non-goals

- **Goals**
  - Reduce `src/routes/+page.svelte` to composition/wiring responsibilities only.
  - Isolate behavior-heavy flows so they can be tested without rendering the full page shell.
  - Keep runtime behavior unchanged (no UX redesign in this refactor).
- **Non-goals**
  - No large store redesign in this pass.
  - No modal component rewrites.
  - No route/API contract changes.

### Target module split (right-sized)

Extract only the highest-density orchestration logic first, and keep lightweight UI handlers in-page.

1. **`usePageInitialization`** (new)
   - Owns `onMount` initialization branch:
     - viewport/responsive initialization
     - authenticated document bootstrap vs guest bootstrap
     - first-load `fork` handling invocation
   - Inputs: `PageData`, `documentStore`, `userStore`
   - Output: `initialize(): Promise<void>` (or internally self-running `onMount` action)

2. **`useForkFlow`** (new)
   - Owns URL-driven fork flow:
     - query param read/cleanup (`fork`, `type`)
     - source document fetch
     - fork-name generation
     - fork document creation + toasts
   - Inputs: page URL accessors/navigation, `documentStore`, toast API
   - Output: `handleForkFromUrl(): Promise<void>`

3. **`useExportActions`** (new)
   - Owns export tracking + download workflows:
     - `trackExport`
     - `handleDownload`
     - `handleDownloadMarkdown`
   - Inputs: `documentStore`, `userStore`, render service adapter (`quillmarkService` + converters), toast API
   - Output: download handler functions consumed by `TopMenu`

4. **Keep in `+page.svelte` for now**
   - simple modal open/close wiring
   - sidebar/mobile view toggles
   - component prop/event plumbing
   - `overlayStore` effect (single short effect, still UI-local)

### Proposed file layout

- `src/lib/features/editor-page/use-page-initialization.svelte.ts`
- `src/lib/features/editor-page/use-fork-flow.svelte.ts`
- `src/lib/features/editor-page/use-export-actions.svelte.ts`
- `src/routes/+page.svelte` (reduced orchestrator)

### Step-by-step execution plan

1. **Baseline + safety checks**
   - Capture current behavior via existing tests/manual smoke notes for:
     - guest bootstrap
     - authenticated bootstrap
     - fork-from-URL
     - pdf/markdown export
   - Add focused unit tests around extracted pure helpers where practical (e.g., filename/extension decisions).

2. **Extract fork flow first (lowest blast radius)**
   - Move `fetchDocument` + `handleForkFromUrl` into `useForkFlow`.
   - Keep same user messaging and navigation semantics.
   - Inject dependencies so module is testable with stubs.

3. **Extract page initialization second**
   - Move mount-time auth/guest bootstrap decision tree into `usePageInitialization`.
   - Delegate fork invocation through injected `handleForkFromUrl` from step 2.
   - Preserve error behavior for missing SSR docs in authenticated mode.

4. **Extract export actions third**
   - Move download/render/track logic into `useExportActions`.
   - Keep identical file naming behavior and export-metrics fire-and-forget semantics.
   - Continue using in-memory loaded content to preserve unsaved edits in exports.

5. **Thin `+page.svelte` and verify**
   - Replace large function bodies with hook wiring + event forwarding.
   - Ensure resulting script block primarily contains:
     - local UI state
     - modal coordinator config
     - small UI handlers
     - hook initialization calls

### Acceptance criteria

- `+page.svelte` no longer contains heavy async business flows (init/fork/export internals).
- New feature modules are dependency-injected and unit-testable without full page render.
- No behavior regression in:
  - auth vs guest startup path
  - fork URL handling
  - export file content/type/naming
  - publish/share modal entry points
- Net result is fewer high-churn lines in `+page.svelte` and clearer ownership boundaries.

### Rollout strategy

- Ship as **2-3 small PRs** instead of one large rewrite:
  1. PR A: `useForkFlow` + wiring
  2. PR B: `usePageInitialization` + wiring
  3. PR C: `useExportActions` + final thinning/tests
- This keeps regressions easier to isolate and revert.

### Risks and mitigations

- **Risk:** hidden coupling to Svelte runes/store reactivity when extracted.
  - **Mitigation:** pass explicit store interfaces/functions into each module; avoid implicit globals inside feature modules.
- **Risk:** duplicate side effects during mount refactor.
  - **Mitigation:** ensure initialization is called once and guarded in hook design.
- **Risk:** regressions in subtle download format branching.
  - **Mitigation:** add table-driven tests for output format → mime/extension mapping.
