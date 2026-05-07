# Audit Notes

Companion to the per-layer findings documents. Records methodology details,
verification corrections, and items explicitly considered and rejected.

## Verification corrections

The raw audit passes flagged these items that did not survive re-checking
against the actual code. Noted here so the next audit doesn't waste cycles
on the same paths:

| Raw claim | Verified status |
|---|---|
| `optionalStringField` is unused | Used in `src/lib/server/utils/request-schemas.ts:71,79`. Keep. |
| `isValidUUID` is unused externally | Used in `src/routes/api/metrics/export/+server.ts:32` and `src/lib/server/utils/request-schemas.ts:40`. Keep. |
| `updateTemplateContent` is dead code | Live: called by `api/templates/[id]/content/+server.ts:20`, consumed by `TemplateDivergenceBanner.svelte`. Contract is odd (see services.md); the method is not vestigial. |
| `DrizzleDocumentService` export is vestigial | Only imported by `document-provider.ts` today, but retiring the provider leaves it as the primary export. Not vestigial. |
| Services lack authorization checks | Intentional — enforced at the route boundary where the authenticated `user.id` is compared against request parameters. Document as a rule; don't push auth deeper. |

## Scope notes

The following surfaces were explicitly **not** audited; if a follow-up pass
is warranted, start here:

- `src/lib/editor/**` and `src/lib/components/**` — client side.
- `src/lib/services/**` (no `server` prefix) — client-facing service clients.
- `drizzle/` migrations.
- `observability/`, `deployment/`, `e2e/`, `tests/`.

## Findings not included

Considered and dropped:

- **Schema-level CHECK constraints vs application validators.** The services
  rely on database-level CHECK constraints (e.g. `contentSizeBytes <= 524288`
  in `src/lib/server/db/schema.ts:113`). One sub-agent argued the app should
  re-enforce the limit. Existing pattern is defensible: let the DB be the
  bottom of the trust boundary.
- **Unused Vercel detection duplication at two call sites** — listed in the
  SSR document but cosmetic; tagged low leverage.
- **"Pick a lane" for error responses (throw vs return)** — referenced across
  api/ssr/services docs but not listed as its own finding; it's a
  consequence of the inconsistencies already documented.

## File map produced

```
prose/refactor/
├── README.md          — lightweight index
├── cross-cutting.md   — themes that span multiple files
├── audit-notes.md     — this file
├── api.md             — routes + utils (15 themes, ~25 locations)
├── ssr.md             — hooks, layout, page loaders, auth, startup (13 themes, ~18 locations)
├── services.md        — services + db (14 themes, ~30 locations)
└── ui/
    ├── components.md         — feature components (14 findings)
    ├── state-and-stores.md   — stores, reactive classes (10 findings)
    ├── editor-substrate.md   — `src/lib/editor/**` (9 findings)
    ├── routes-and-layout.md  — client routes + `src/app.css` (6 findings)
    └── primitives.md         — `ui/`, `utils/`, `icons/` (10 findings)
```

## Highest-single-leverage change

Collapsing the `document-provider.ts` / `template-provider.ts` indirection
(see [services § Provider indirection](./services.md#provider-indirection))
is the largest reduction in code and cognitive load available from this audit.
It directly removes:

- `document-provider.ts` (71 lines, including the `user_id` fallback branch).
- `template-provider.ts` (15 lines).
- ~24 `const service = getTemplateLibraryService();` preambles across route
  handlers.
- The async/sync factory-shape inconsistency.
- The defensive parameter-name fallback in `createDocument`.

Net deletion is ~90 lines of code and several hundred lines of cognitive
overhead, with no runtime behavior change.
