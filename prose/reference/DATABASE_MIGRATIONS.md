# Database Migrations Reference

**Purpose**: Reference for managing Drizzle ORM migrations against PostgreSQL (Neon or self-hosted).

**TL;DR**: Migrations live in `drizzle/migrations/`. Drizzle tracks applied migrations in a `drizzle.__drizzle_migrations` table on the database. The local `_journal.json` lists available migrations; the database table records which have been applied.

---

## Running Migrations

Drizzle-kit reads its config from `drizzle.config.ts`, which uses `import 'dotenv/config'` and therefore loads `.env` (not `.env.dev`). Since `.env` typically has no `DATABASE_URL`, you must pass it explicitly:

```bash
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" npm run db:migrate
```

Without the `DATABASE_URL=...` prefix, drizzle falls back to `postgresql://localhost/tonguetoquill_dev` and will fail with `ECONNREFUSED` if no local PostgreSQL is running.

The same applies to `db:studio`:

```bash
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" npm run db:studio
```

---

## How Migration Tracking Works

Drizzle uses two coordinated pieces:

| Component | Location | Purpose |
|---|---|---|
| `_journal.json` | `drizzle/migrations/meta/` | Local manifest of all migration files and their order |
| `__drizzle_migrations` | `drizzle` schema in the database | Records which migrations have been applied (by SHA-256 hash) |

When `drizzle-kit migrate` runs, it compares hashes from `_journal.json` against the `__drizzle_migrations` table and applies any missing migrations in order.

**Key rule**: Never modify a migration file after it has been applied to a database. Drizzle identifies migrations by the SHA-256 hash of their SQL content — changing the file changes the hash, causing drizzle to treat it as unapplied.

---

## Recovering Out-of-Sync Migration Tracking

If the database schema is correct but `drizzle.__drizzle_migrations` is empty or missing entries (e.g., after restoring from a backup, or migrating from a different tool), you can manually insert records.

### Step 1: Compute migration hashes

```bash
for f in drizzle/migrations/*.sql; do
  echo "$(shasum -a 256 "$f" | cut -d' ' -f1)  $f"
done
```

### Step 2: Get timestamps from `_journal.json`

Each entry in `drizzle/migrations/meta/_journal.json` has a `when` field (Unix timestamp in milliseconds).

### Step 3: Insert records for already-applied migrations

Connect to the database with `psql` and insert:

```sql
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
  ('<hash_of_0000>', 1700000000000),
  ('<hash_of_0001>', 1767000000000),
  ('<hash_of_0002>', 1767000001000);
```

Only insert rows for migrations that are **actually applied** to the schema. Any remaining migrations will be applied on the next `npm run db:migrate`.

### Step 4: Verify

```sql
SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at;
```

---

## PostgreSQL Version Compatibility

Drizzle-kit may generate `ADD CONSTRAINT IF NOT EXISTS` syntax, which requires **PostgreSQL 16+**. Neon databases created before late 2024 may run PostgreSQL 15 or earlier.

If you encounter `syntax error at or near "NOT"` on an `ADD CONSTRAINT IF NOT EXISTS` statement, your PG version does not support this syntax. Options:

1. **Upgrade the Neon project** to PostgreSQL 16+ (recommended)
2. **Wrap in a DO block** for pre-16 compatibility (only for new migrations, never edit applied ones):
   ```sql
   DO $$ BEGIN
     ALTER TABLE "t" ADD CONSTRAINT "fk_name" FOREIGN KEY ("col") REFERENCES "other"("id");
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$;
   ```

---

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | No `DATABASE_URL` provided; defaulting to localhost | Pass `DATABASE_URL=...` on the command line |
| `ENOTFOUND <hostname>` | Malformed URL (e.g., leading space in env var) | Check for whitespace in `DATABASE_URL` value |
| `syntax error at or near "NOT"` | `ADD CONSTRAINT IF NOT EXISTS` on PG < 16 | See PostgreSQL Version Compatibility above |
| Migration re-runs already-applied SQL | `__drizzle_migrations` table empty or missing entries | See Recovering Out-of-Sync section above |

---

## Cross-References

- [ARCHITECTURE.md](../designs/ARCHITECTURE.md) - Overall application architecture
- [DB_SECURITY_DB10.md](../designs/DB_SECURITY_DB10.md) - Database security considerations

---

_Last Updated: 2026-02-26_
_Status: Current_
