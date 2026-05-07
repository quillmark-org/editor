# API Reference

**Purpose**: Authoritative reference for every application HTTP endpoint under `src/routes/**/+server.ts`, plus the server-side load functions that talk to the database.

**Scope**: This document covers the endpoints owned by the application (`/api/*`). Auth.js owns the `/auth/*` subtree via its SvelteKit integration in `src/hooks.server.ts` and `src/lib/server/auth.ts`; those routes are not documented here — see [AUTHENTICATION.md](../designs/AUTHENTICATION.md).

---

## Base URL

All endpoints are relative to the deployment origin:

- Local dev: `http://localhost:5173`
- Production: the deployed origin

---

## Trust Boundaries

| Tier | Check | Endpoints |
|---|---|---|
| `anon` (public) | none | `GET /api/health`, `GET /api/public/documents/[id]`, `GET /api/templates/[id]` |
| `opt` (guest-aware) | `guestAwareAuth` — bypassed when `PUBLIC_GUEST_MODE_DISABLED=true` | `GET /api/templates` |
| `req` (authenticated) | `requireAuth` / `getSession` — Auth.js session cookie | everything else under `/api/*` |
| `cron` | `Authorization: Bearer $CRON_SECRET`, constant-time compared | `/api/cron/*` |

Session cookies are HTTP-only, managed by Auth.js v5. CSRF defence relies on the cookie's `SameSite=lax` plus SvelteKit's built-in same-origin POST check. In development (`NODE_ENV === 'development'`) CSRF is relaxed to `trustedOrigins: ['*']`; this branch is **not** gated by any env var in production.

---

## Error Response Formats

Most endpoints use the flat envelope emitted by `errorResponse(code, message, status)` in `src/lib/server/utils/api.ts`:

```json
{ "error": "validation_error", "message": "Invalid id: must be a valid UUID" }
```

`POST /api/feedback` is the exception — it wraps the payload one level deeper (`{ error: { code, message, fields? } }`) to support field-level validation feedback.

Common status codes used across the API:

| Status | Meaning |
|---|---|
| 200 | OK |
| 201 | Created (POSTs that insert a row) |
| 204 | No content — either a successful delete or a deliberately ambiguous "not found / not yours / noop" response on endpoints that must not leak existence |
| 400 | Validation error |
| 401 | No session / session expired |
| 404 | Not found **or** not visible to the caller (owned by someone else, or unpublished template) |
| 500 | Unhandled service error |

**Security pattern — ambiguous 404**: endpoints that touch a resource the caller might not own (`GET /api/documents/[id]`, `GET /api/public/documents/[id]`, anything under `/api/templates/[id]`) return a single ambiguous 404 for the "not found", "not yours", and "private" cases so callers cannot probe for resource existence. `src/lib/server/utils/ambiguous-response-logging.ts` emits a correlation ID for these.

---

## Endpoint Inventory

Each section lists: **Auth tier · DB tables touched · Service function**. Request bodies are snake_case throughout (matches the parsers in `src/lib/server/utils/request-schemas.ts`).

### `GET /api/health`

- Auth: `anon`
- DB: none
- Returns a static JSON heartbeat: `{ status: 'healthy', timestamp: <iso> }`. The `timestamp` is the only disclosed field. No DB probe, no bearer-token gate.

### `POST /api/beta-program`

- Auth: `req`
- DB: `beta_notifications` (insert/update)
- Service: `betaProgramService.recordResponse(user.id, 'accepted' | 'declined')`
- One row per user (PK `userId`).

### `POST /api/feedback`

- Auth: `req` (via `getSession`)
- DB: `users` (select name/email)
- External: outbound POST to GitHub Issues API **or** GitLab Issues API, selected by which of `FEEDBACK_GITHUB_KEY` / `FEEDBACK_GITLAB_KEY` is configured.
- Request body:

  ```json
  {
    "type": "bug" | "feature-request" | "ux-issue",
    "title": "3–120 chars",
    "description": "10–5000 chars",
    "environment": {
      "browser": "≤120", "os": "≤120", "route": "≤300", "screen": "≤120"
    }
  }
  ```

- `title` and `description` are markdown-escaped before interpolation into the issue body.
- `FEEDBACK_GITLAB_URL` is parsed, required to be `https:`, and pinned against a host allowlist (`gitlab.com`, `sync.git.mil`).
- On success returns the upstream issue object (`{ id, url }` shape); on upstream failure returns `502` with the nested error envelope.

### `GET /api/documents`

- Auth: `req`
- DB: `documents` (select + count; subquery on `templates` to flag which docs have a published template)
- Service: `documentService.listUserDocuments`
- Query: `offset`, `limit` via `parsePaginationParams`. Results are scoped to `ownerId = session.user.id`.

### `POST /api/documents`

- Auth: `req`
- DB: `documents` (insert).
- Service: `documentService.createDocument`
- Request body:

  ```json
  { "name": "string (required)", "content": "string (≤524288 bytes)" }
  ```

- `ownerId` and `is_public` are set server-side (session + defaults); they cannot be injected from the body.
- Template-backed document creation uses `POST /api/templates/[id]/import`, not this endpoint.

### `GET /api/documents/[id]`

- Auth: `req`
- DB: `documents` (select WHERE `id + ownerId`)
- Service: `documentService.getDocumentContent`
- Returns 404 if not found **or** not owned by caller.

### `PUT /api/documents/[id]`

- Auth: `req`
- DB: `documents` (update WHERE `id + ownerId`)
- Service: `documentService.updateDocument`
- Request body (all optional; at least one required):

  ```json
  { "name": "string?", "content": "string (≤524288 bytes)?", "is_public": "boolean?" }
  ```

### `DELETE /api/documents/[id]`

- Auth: `req`
- DB: `documents` (delete WHERE `id + ownerId`). Cascades to `templates.documentId` (set null), `template_import_events` (cascade), `document_export_events` (set null).
- Service: `documentService.deleteDocument`

### `GET /api/documents/[id]/metadata`

- Auth: `req`
- DB: `documents` (select metadata WHERE `id + ownerId`)
- Service: `documentService.getDocumentMetadata`
- Same result set as the full GET minus `content` — cheaper for existence/ownership probes.

### `GET /api/public/documents/[id]`

- Auth: `anon`
- DB: `documents` (select WHERE `id + is_public`) JOIN `users` for owner display name.
- Service: `documentService.getPublicDocument`
- Response fields are deliberately limited: `{ id, name, content, owner_display_name }`. Owner UUID is not exposed.
- Returns ambiguous 404 for the not-found / private / exception cases.

### `GET /api/templates`

- Auth: `opt` (`guestAwareAuth`)
- DB: `templates` (list/filter/search). May join `users` and `template_stars` depending on the query.
- Service: `getTemplateLibraryService().listTemplates`

### `POST /api/templates`

- Auth: `req`
- DB: `documents` (ownership + `is_public` check), `templates` (insert).
- Service: `getTemplateLibraryService().createTemplate`
- Request body:

  ```json
  { "document_id": "uuid (required)", "title": "string", "description": "string" }
  ```

- Publishing is blocked (400 `validation_error`) when the source document is not public — a published template is effectively a public snapshot, so its source must be public too.

### `GET /api/templates/[id]`

- Auth: `anon` — public read, served with ETag + `Cache-Control` from `src/lib/server/utils/cdn-cache.ts`.
- DB: `templates` (select WHERE `id + is_published=true`).
- Service: `service.getTemplate(id, null)` — the `userId=null` call intentionally omits the per-user `is_starred` field.

### `PUT /api/templates/[id]`

- Auth: `req`
- DB: `templates` (update metadata WHERE `id + ownerId`)
- Service: `service.updateTemplateMetadata`
- Request body (all optional):

  ```json
  { "title": "string?", "description": "string?" }
  ```

### `DELETE /api/templates/[id]`

- Auth: `req`
- DB: `templates` (soft-delete: set `is_published=false` WHERE `id + ownerId`). The cascaded fork-document delete is also scoped by `ownerId` as a defence-in-depth predicate.
- Service: `service.unpublishTemplate`

### `PUT /api/templates/[id]/content`

- Auth: `req`
- DB: `templates` (update content/hash WHERE `id + ownerId`); reads the linked `documents.content` WHERE `documentId + ownerId`.
- Service: `service.updateTemplateContent`
- Republishes the template by snapshotting the current document content.

### `POST /api/templates/[id]/import`

- Auth: `req`
- DB: `templates` (select), `documents` (insert a new owned copy), `template_import_events` (append), `template_user_recents` (upsert `(user_id, template_id)` pair with `last_imported_at = now()`), `templates` (increment `import_count`).
- Service: `service.importTemplate`
- Request body (optional): `{ "name": "string" }` — overrides the document name; defaults to the template title. Content is always sourced from the server-side template; clients do not supply it.
- Returns the full created `Document` (201).
- No per-user dedup: the same user may import the same template repeatedly; each call counts against `import_count`.
- This is the only path for template-backed document creation; `POST /api/documents` handles blank documents only.

### `PUT /api/templates/[id]/reset`

- Auth: `req`
- DB: `templates` (select snapshot), `documents` (update content WHERE `ownerId` matches).
- Service: `service.resetTemplateToPublished`
- Restores a fork document's content to the currently-published template snapshot.

### `POST /api/templates/[id]/star`

- Auth: `req`
- DB: `template_stars` (insert, `ON CONFLICT DO NOTHING`), `templates` (increment `star_count`).
- Service: `service.starTemplate`
- Idempotent — a double-star will not double-increment. Starring an unpublished template is blocked.

### `DELETE /api/templates/[id]/star`

- Auth: `req`
- DB: `template_stars` (delete WHERE `templateId + userId`), `templates` (decrement `star_count`, floored at 0).
- Service: `service.unstarTemplate`

### `GET /api/templates/by-document/[documentId]`

- Auth: `req`
- DB: `templates` (select WHERE `documentId + ownerId`)
- Service: `service.getTemplateByDocumentId`
- Returns the template (if any) published from the caller's document. 404 covers both "no template" and "not your document".

### `GET /api/templates/recents`

- Auth: `req`
- DB: `template_user_recents` JOIN `templates` JOIN `users`, filtered by user; ordered by `last_imported_at DESC`.
- Service: `service.listRecentTemplates`
- Caller-supplied `limit` is capped at 50; `q` filters title/description via `ILIKE`.

### `GET /api/templates/starred`

- Auth: `req`
- DB: `template_stars` (select by user)
- Service: `service.getStarredTemplateIds`
- Returns the full set of starred template IDs (no pagination at time of writing).

### `POST /api/metrics/export`

- Auth: `req`
- DB: `metrics_export_rate_limits` (upsert fixed-window bucket), `document_export_events` (insert), `user_activity` (upsert `ON CONFLICT DO NOTHING`).
- Service: `allowExportRequest`, `recordExport`
- Rate limit: **10 requests / minute / user**. The Postgres row lock on the rate-limit upsert is what serialises concurrent requests.
- `document_id` is both UUID-validated and ownership-checked (via `documentService.getDocumentMetadata`) before the event is recorded.

### `GET /api/cron/mark-template-official`

- Auth: `cron`
- DB: `templates` (update `quill_ref` / official marker)
- Service: `markTemplateOfficialByIdWithAppDb`

### `GET /api/cron/repair-template`

- Auth: `cron`
- DB: `templates` + `documents` (read/update snapshot consistency)
- Service: `repairTemplateWithAppDb`
- Requires a `template_id` UUID query param.

### `GET /api/cron/seed-templates`

- Auth: `cron`
- DB: `templates` (upsert official seeded templates); reads `users` for a system owner when one is provisioned.
- External: outbound HTTP to `getSiteURL()` to fetch the manifest + template payloads. Filename components are validated against `^[A-Za-z0-9_-]+\.[a-z]+$` before fetch.

---

## Server-Rendered Load Functions (non-`/api` DB touches)

| File | Auth | DB | Purpose |
|---|---|---|---|
| `src/routes/+layout.server.ts` | session read | Auth.js adapter internals may touch `users` / `accounts` on session refresh | Exposes session + static manifests to every page. `session.user.email` is stripped before serialisation to page data to avoid leaking PII to client-side scripts. |
| `src/routes/+page.server.ts` | `req` (when session present) | `documents` (list by owner) | Home / editor SSR preload. |
| `src/routes/doc/[id]/+page.server.ts` | `anon` | `documents` JOIN `users` (public only) | Public document viewer — same visibility rules as `GET /api/public/documents/[id]`. |

---

## Database Tables

| Table | Purpose | Key constraints |
|---|---|---|
| `users` | Auth.js identity + app profile JSON | PK `id` (uuid); `email` **not** unique (per-provider isolation) |
| `accounts` | Auth.js OAuth linkage | PK `(provider, providerAccountId)`; FK `userId → users` cascade |
| `documents` | User-owned documents | FK `ownerId → users` cascade; CHECK `content_size_bytes <= 524288` |
| `templates` | Published document snapshots | FK `ownerId → users`; FK `documentId → documents` (SET NULL); uniqueIndex on `documentId` |
| `template_stars` | Star relationships | PK `(templateId, userId)`; both FKs cascade |
| `template_import_events` | Append-only import audit trail | FK `templateId, userId` cascade; `documentId` SET NULL |
| `metrics_export_rate_limits` | Fixed-window rate-limit buckets | PK `(userId, windowStart)`; CHECK `count > 0` |
| `user_activity` | DAU / WAU ledger (per user per UTC day) | PK `(userId, date)` |
| `document_export_events` | Append-only export audit trail | FK `userId` cascade, `documentId` SET NULL |
| `beta_notifications` | One-row-per-user beta opt-in ledger | PK `userId` |

Schema source of truth: `src/lib/server/db/schema.ts` (Drizzle).

---

## Cross-Cutting Server Utilities

| File | Role |
|---|---|
| `src/hooks.server.ts` | `authHandle` (Auth.js) → `guestControlHandle` (redirect to `/signin` when `PUBLIC_GUEST_MODE_DISABLED=true`). Bypasses `/auth/*` exactly. |
| `src/lib/server/auth.ts` | Auth.js v5 config (OIDC providers, Drizzle adapter). |
| `src/lib/server/utils/auth.ts` | `requireAuth`, `optionalAuth`, `guestAwareAuth`, `getSession` — session-to-user mapping. |
| `src/lib/server/utils/api.ts` | `isValidUUID`, `validateUUID`, `errorResponse`, `handleServiceError`, `getSiteURL`. |
| `src/lib/server/utils/request-schemas.ts` | Shared parsers: create/update document + template. |
| `src/lib/server/utils/request-validation.ts` | `parsePaginationParams`, string-field helpers. |
| `src/lib/server/utils/ambiguous-response-logging.ts` | Correlation IDs for deliberately ambiguous 404/204 responses. Client-supplied `x-correlation-id` is validated against `^[A-Za-z0-9-]{1,64}$`; otherwise a server-generated UUID is substituted. |
| `src/lib/server/utils/cdn-cache.ts` | ETag + `Cache-Control` for CDN-cacheable GETs. |

---

## Cross-References

- [AUTHENTICATION.md](../designs/AUTHENTICATION.md) — Auth.js flow, session refresh, guest fallback
- [SHARE_SYSTEM.md](../designs/SHARE_SYSTEM.md) — public document sharing UX + ambiguous-404 rationale
- [SERVICE_FRAMEWORK.md](../designs/SERVICE_FRAMEWORK.md) — client/server service patterns
- [TEMPLATE_LIBRARY.md](../designs/TEMPLATE_LIBRARY.md) — template publishing / import / star model
- [METRICS.md](../designs/METRICS.md) — `document_export_events`, `user_activity`, Grafana queries
- [ERROR_SYSTEM.md](../designs/ERROR_SYSTEM.md) — `AppError` hierarchy and typed error codes
- [../taskings/API_VULNS.md](../taskings/API_VULNS.md) — security audit of this surface
