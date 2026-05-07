# Maintainability Refactor — Findings

**Date:** 2026-04-22

Reconnaissance pass over the codebase, organized by architectural layer. Each
per-layer document catalogs vestigial, redundant, over-engineered, and smelly
code with `file:line` locations and a suggested direction — not a change plan.

## Layers

| Layer | Scope |
|---|---|
| [ui/](./ui/) | `src/lib/components/**`, `src/lib/stores/**`, `src/lib/editor/**`, `src/lib/components/ui/**`, `src/routes/**/+page.svelte`, `src/app.css` |
| [ssr.md](./ssr.md) | root hooks, `*.server.ts` loaders, auth, startup, manifest |
| [api.md](./api.md) | `src/routes/api/**` and `src/lib/server/utils/**` |
| [services.md](./services.md) | `src/lib/server/services/**` and `src/lib/server/db/**` |

The UI layer has five sub-documents inside [`ui/`](./ui/):
[components](./ui/components.md) ·
[state-and-stores](./ui/state-and-stores.md) ·
[editor-substrate](./ui/editor-substrate.md) ·
[routes-and-layout](./ui/routes-and-layout.md) ·
[primitives](./ui/primitives.md).

## Also in this folder

- [cross-cutting.md](./cross-cutting.md) — themes whose fix retires 3–5
  per-file findings at once. **Read this first** if you're planning a refactor
  campaign rather than a spot fix.
- [audit-notes.md](./audit-notes.md) — methodology, verification corrections,
  explicit non-findings.

## Out of scope

Tests, build config, drizzle migrations, observability and deployment tooling.
See [audit-notes.md](./audit-notes.md#scope-notes) for the full list.

## Finding shape

Each finding carries **Location** (`file:line`), **Category** (vestigial /
redundant / over-engineered / smelly), **What**, **Why it smells**, and
**Direction**. The UI documents tag **Severity** (H / M / L); the server
documents tag **Leverage** (high / medium / low) — use whichever the source
doc provides. Line numbers are accurate as of the audit commit; verify before
editing.

## Relationship to existing proposals

Several findings already have dedicated proposals under
[`prose/proposals/simplifications/`](../proposals/simplifications/). Where
that is true, the finding entry links out and does not re-litigate the design.
