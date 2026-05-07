# Collapse Template List + Count into One Query

**Purpose**: Halve the DB round-trips (and duplicated JOIN work) for paginated template listings.

**Status**: Proposed
**Related**: `src/lib/server/services/templates/template-drizzle-service.ts:161-185`

---

## Problem

The paginated list path issues two queries with **identical** `WHERE` and `INNER JOIN` clauses:

```ts
const rows = await db
  .select({ /* 10 columns */ })
  .from(schema.templates)
  .innerJoin(schema.users, eq(schema.templates.ownerId, schema.users.id))
  .where(whereClause)
  .orderBy(...orderByArr)
  .limit(validatedLimit)
  .offset(offset);

const [countResult] = await db
  .select({ total: count() })
  .from(schema.templates)
  .innerJoin(schema.users, eq(schema.templates.ownerId, schema.users.id))
  .where(whereClause);
```

The count query repeats the join and any predicate work (including `ln(…) + EXTRACT(EPOCH FROM …) / …` in the "popular" branch, though the count doesn't need the ordering expression). Two separate round-trips cost ~2x latency on a connection that's otherwise fast.

## Scope

In-scope: the list/count pair in `listTemplates`. Out of scope: other template queries, pagination API shape, any DB schema change.

## Options

### A. `COUNT(*) OVER()` window function (recommended)

Add `total: sql<number>`…`COUNT(*) OVER()`…`.as('total')` to the existing `select({…})` and drop the second query. Each row carries the same `total`; read it off `rows[0]` (or `0` when empty).

```ts
const rows = await db
  .select({
    id: …,
    // …
    total: sql<number>`COUNT(*) OVER()`.mapWith(Number)
  })
  .from(…)
  .innerJoin(…)
  .where(whereClause)
  .orderBy(...)
  .limit(validatedLimit)
  .offset(offset);

const total = rows[0]?.total ?? 0;
```

Tradeoffs:
- ✅ One round-trip, one plan, WHERE evaluated once.
- ⚠️ Each row carries a duplicate integer over the wire. Negligible for `limit ≤ 100`.
- ⚠️ Postgres computes `COUNT(*) OVER()` by materializing the full result set. For large filtered sets this can be slower than two separate queries because `LIMIT` can't prune. Verify with `EXPLAIN ANALYZE` on the prod-like dataset for the worst-case filter before shipping.

### B. `db.batch([…])`

Drizzle's `batch` would pipeline both queries. Simpler conceptually; no window-function semantics to reason about. Not all drivers support it — check the driver in use (`postgres-js`? `node-postgres`?) before committing.

### C. Do nothing

Keep both queries but assert that `whereClause` is computed once (it already is, via the closure). This is the safest option if a quick `EXPLAIN` shows (A) regresses on the most-common filter.

## Recommendation

Prototype **A**, benchmark against the current 2-query version on realistic data (use the "popular" ordering branch since it has the heaviest predicates). If (A) wins or ties, ship it. If it loses, fall back to **B** where available, otherwise stay on (C).

## Non-goals

- Don't cache counts. The listing is user-specific and the popularity ordering shifts constantly.
- Don't add cursor pagination as part of this change. Separate concern, larger blast radius.

## Risk

Low-medium. A correctness test is easy (query with and without the window function on the same filter and compare totals). The only risk is a perf regression on a filter we haven't measured — which is why the benchmarking step is non-optional.
