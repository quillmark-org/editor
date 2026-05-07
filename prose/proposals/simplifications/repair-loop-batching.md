# Template Repair Loop: Batch the Writes

**Purpose**: Cut wall-clock time of the template repair endpoint when many templates need rewriting.

**Status**: Obsolete — the bulk `document_id` path this proposal targeted has been removed. The cron now repairs a single template by `template_id`, so there is no inner loop left to batch.
**Related** (historical): `src/lib/server/services/templates/repair-templates-by-document-db.ts` → now `repair-template-db.ts`; cron route `src/routes/api/cron/repair-templates-by-document/+server.ts` → now `src/routes/api/cron/repair-template/+server.ts`.

---

## Problem

`repair-templates-by-document-db.ts:98-141` runs a serial loop:

```ts
for (const template of templates) {
  const repaired = await runContentRepairs(template.content, now, repairIds);
  if (!dryRun && didChange) {
    await db.update(schema.templates).set({ … }).where(…);
    if (template.documentId) {
      await db.update(schema.documents).set({ … }).where(…);
    }
  }
}
```

For N templates with changes this is 1 (or 2) sequential DB round-trips per template, plus the CPU-bound `runContentRepairs` call. At the scale of a per-document repair this is likely small (a document's templates are few). At the scale of the cron job that walks all documents it can become dominant.

## Scope

In-scope: changing the *write* pattern inside this function. Out of scope: changing `runContentRepairs` semantics, or changing the API shape of the cron route.

## Decisions to make

### 1. What failure mode do we want?

- **Fail-fast (current behavior):** first error aborts, later templates are untouched. The returned `rows` reflects exactly what was attempted.
- **Best-effort:** attempt every template, collect errors per-row, return partial success. Operationally preferable for a cron job; forces callers to inspect `rows[].error`.

The cron caller logs and moves on, so **best-effort** is the natural fit. Confirm this before implementing.

### 2. How to parallelize

- **Promise.all over templates** — simplest. Bounds driven by DB pool size; with a pgbouncer in front, this is typically fine for a few hundred rows. For unbounded input size, use a small concurrency limiter (e.g. 8).
- **Batched updates with a single SQL statement** — e.g. `UPDATE templates SET … FROM (VALUES (…), (…)) AS v(id, content, hash) WHERE templates.id = v.id`. Fastest, but tricky with Drizzle because the payload is per-row and `content` can be large. Only worth it if profiling shows the loop is the bottleneck.

## Recommended path

1. Switch to best-effort semantics.
2. Replace the for-loop body with a `Promise.all` of per-template tasks, each of which runs `runContentRepairs` then does the (at most 2) updates sequentially *within* that task — keep the template update before the document update to preserve the existing dependency.
3. Cap concurrency at 8 via a small helper (or `p-limit` if already in deps).
4. Add a `rowErrors: string[]` field on `TemplateRepairRunRow` and surface counts in the returned summary.

## Non-goals

- Don't move to a transaction that spans all templates. One bad row shouldn't roll back the rest.
- Don't precompute `runContentRepairs` in a worker. The function is synchronous string work; the DB round-trips are the real latency.
- Don't add a per-row retry. The cron runs on a schedule — let the next run pick up stragglers.

## Risk

Medium. Changes failure semantics. Needs a regression test with an injected DB error mid-batch to confirm partial success behaves as intended.
