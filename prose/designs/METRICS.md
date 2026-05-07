# Metrics System

## Overview

Three core metrics are tracked:

- Documents created per user
- Documents exported/downloaded
- Daily and weekly active users (DAU/WAU)

The first metric is already fully derivable from the existing `documents` table — no new infrastructure needed. Two lightweight tables cover the gaps: `document_export_counts` and `user_activity`. Grafana connects directly to PostgreSQL via a read-only data source.

## Metric Sources

### Documents Created Per User

**Source**: existing `documents` table — no new tables or instrumentation needed.

Relevant columns: `owner_id`, `created_at`.

### Documents Exported

**Source**: `document_export_counts` table.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | FK to `users.id` |
| `day` | date | Calendar date (UTC) |
| `count` | integer | Export count for the day, incremented via UPSERT |

`(user_id, day)` is the primary key. Inserts use `ON CONFLICT … DO UPDATE SET count = count + 1`.

### Daily and Weekly Active Users

**Source**: new `user_activity` table.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | FK to `users.id` |
| `date` | date | Calendar date of activity (UTC) |

`(user_id, date)` is the primary key — uniqueness is enforced by the constraint, so inserts use `ON CONFLICT DO NOTHING`. No deduplication logic needed in application code.

## Instrumentation Points

All writes are server-side, in SvelteKit API route handlers.

| Table | Where to instrument |
|---|---|
| `document_export_counts` | Export/download endpoint — after file is generated and returned |
| `user_activity` | Auth.js session callback (`event.locals.auth()`) — on successful session validation |

### Write Behavior

Metric inserts happen after the primary operation succeeds. They are:
- Not awaited (fire-and-forget): the API response does not wait for the metric write
- Wrapped in try/catch: a failure is logged but does not surface as a user error

See [ERROR_SYSTEM.md](ERROR_SYSTEM.md) for error logging conventions.

## Grafana Integration

Grafana uses the **PostgreSQL data source** plugin with a read-only database user. That user has `SELECT` on `documents`, `document_export_counts`, and `user_activity` only.

### Dashboard Panels

**Documents created per user**
```sql
SELECT owner_id, COUNT(*) AS documents_created
FROM documents
WHERE created_at BETWEEN $__timeFrom() AND $__timeTo()
GROUP BY owner_id
ORDER BY documents_created DESC
```

**Documents created over time**
```sql
SELECT date_trunc('day', created_at) AS day, COUNT(*) AS created
FROM documents
WHERE created_at BETWEEN $__timeFrom() AND $__timeTo()
GROUP BY day
ORDER BY day
```

**Documents exported over time**
```sql
SELECT day, SUM(count) AS exports
FROM document_export_counts
WHERE day BETWEEN $__timeFrom()::date AND $__timeTo()::date
GROUP BY day
ORDER BY day
```

**Daily active users (DAU)**
```sql
SELECT date, COUNT(DISTINCT user_id) AS dau
FROM user_activity
WHERE date BETWEEN $__timeFrom()::date AND $__timeTo()::date
GROUP BY date
ORDER BY date
```

**Weekly active users (WAU)**
```sql
SELECT date_trunc('week', date::timestamptz) AS week, COUNT(DISTINCT user_id) AS wau
FROM user_activity
WHERE date BETWEEN $__timeFrom()::date AND $__timeTo()::date
GROUP BY week
ORDER BY week
```

`$__timeFrom()` and `$__timeTo()` are Grafana's built-in time range macros.

## Cross-References

- [SERVICE_FRAMEWORK.md](SERVICE_FRAMEWORK.md) — Server service patterns for instrumentation code
- [ERROR_SYSTEM.md](ERROR_SYSTEM.md) — Error logging for failed metric writes
- [AUTHENTICATION.md](AUTHENTICATION.md) — Session context used to resolve `user_id`
