# API & Database Interaction Inventory

Comprehensive inventory of every HTTP API path and every database table it touches.
Scope: `src/routes/**/+server.ts` (endpoint handlers) and `src/routes/**/+page.server.ts` / `+layout.server.ts` (server-side loaders that talk to the DB).

## Database Schema (Drizzle — `src/lib/server/db/schema.ts`)

| Table | Purpose | Key FKs / constraints |
|---|---|---|
| `users` | Auth.js user identity + app profile JSON | PK `id` (uuid); `email` NOT unique (intentional per-provider isolation) |
| `accounts` | Auth.js OAuth linkage | PK `(provider, providerAccountId)`; FK `userId → users` (cascade) |
| `documents` | User-owned documents (content, visibility) | FK `ownerId → users` (cascade); CHECK `content_size_bytes <= 524288` |
| `templates` | Published document snapshots | FK `ownerId → users`; FK `documentId → documents` (set null); uniqueIndex on `documentId` |
| `template_stars` | Star relationships | PK `(templateId, userId)`; both FKs cascade |
| `template_import_events` | Append-only import audit trail | FK `templateId`, `userId` cascade; `documentId` set null |
| `template_user_recents` | Per-user recents read-model (one row per `(user, template)` pair) | PK `(userId, templateId)`; both FKs cascade; index `(userId, last_imported_at DESC)` |
| `metrics_export_rate_limits` | Fixed-window rate-limit buckets for export | PK `(userId, windowStart)`; CHECK `count > 0` |
| `user_activity` | DAU/WAU ledger (per user per UTC day) | PK `(userId, date)` |
| `document_export_events` | Append-only export audit trail | FK `userId` cascade, `documentId` set null |
| `beta_notifications` | One-row-per-user beta opt-in ledger | PK `userId` |

## Cross-Cutting Server Utilities

| File                                                 | Role                                                                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/hooks.server.ts`                                | `authHandle` (Auth.js) then `guestControlHandle` (redirect to `/signin` when `PUBLIC_GUEST_MODE_DISABLED=true`). Bypasses `/auth/*`. |
| `src/lib/server/auth.ts`                             | Auth.js v5 configuration (OIDC providers, Drizzle adapter).                                                                          |
| `src/lib/server/utils/auth.ts`                       | `requireAuth`, `optionalAuth`, `guestAwareAuth`, `getSession` — session-to-user mapping.                                             |
| `src/lib/server/utils/api.ts`                        | `validateUUID`, `errorResponse`, `handleServiceError`, `getSiteURL`.                                                                 |
| `src/lib/server/utils/request-schemas.ts`            | Shared parsers: create/update document + template.                                                                                   |
| `src/lib/server/utils/request-validation.ts`         | `parsePaginationParams`, string-field helpers.                                                                                       |
| `src/lib/server/utils/ambiguous-response-logging.ts` | Emits correlation IDs for deliberately ambiguous 404/204 responses.                                                                  |
| `src/lib/server/utils/cdn-cache.ts`                  | ETag + `Cache-Control` for CDN-cacheable GETs.                                                                                       |

## API Endpoint Inventory

Legend — **Auth**: `anon` (public), `opt` (guest-aware / optional), `req` (session required), `cron` (HMAC `Authorization: Bearer <CRON_SECRET>`).

### `/api/health`

| Method | File                               | Auth | DB tables touched | Notes                  |
| ------ | ---------------------------------- | ---- | ----------------- | ---------------------- |
| GET    | `src/routes/api/health/+server.ts` | anon | (none)            | Static JSON heartbeat. |

### `/api/beta-program`

| Method | File                                     | Auth | DB tables                            | Service call                                           |
| ------ | ---------------------------------------- | ---- | ------------------------------------ | ------------------------------------------------------ | ------------ |
| POST   | `src/routes/api/beta-program/+server.ts` | req  | `beta_notifications` (insert/update) | `betaProgramService.recordResponse(user.id, 'accepted' | 'declined')` |

### `/api/feedback`

| Method | File                                 | Auth                   | DB tables                   | External calls                                                                                                   |
| ------ | ------------------------------------ | ---------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| POST   | `src/routes/api/feedback/+server.ts` | req (via `getSession`) | `users` (select name/email) | Outbound POST to GitHub Issues API **or** GitLab Issues API using `FEEDBACK_GITHUB_KEY` / `FEEDBACK_GITLAB_KEY`. |

### `/api/documents`

| Method | File                                  | Auth | DB tables                                                                                                                                       | Service call                        |
| ------ | ------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| GET    | `src/routes/api/documents/+server.ts` | req  | `documents` (select + count, subquery on `templates`)                                                                                           | `documentService.listUserDocuments` |
| POST   | `src/routes/api/documents/+server.ts` | req  | `documents` (insert)                                                                                                                             | `documentService.createDocument`    |

### `/api/documents/[id]`

| Method | File                                       | Auth | DB tables                                                                                                                   | Service call                         |
| ------ | ------------------------------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| GET    | `src/routes/api/documents/[id]/+server.ts` | req  | `documents` (select where id+owner)                                                                                         | `documentService.getDocumentContent` |
| PUT    | `src/routes/api/documents/[id]/+server.ts` | req  | `documents` (update where id+owner)                                                                                         | `documentService.updateDocument`     |
| DELETE | `src/routes/api/documents/[id]/+server.ts` | req  | `documents` (delete where id+owner; cascades to `templates.documentId`, `template_import_events`, `document_export_events`) | `documentService.deleteDocument`     |

### `/api/documents/[id]/metadata`

| Method | File                                                | Auth | DB tables                                    | Service call                          |
| ------ | --------------------------------------------------- | ---- | -------------------------------------------- | ------------------------------------- |
| GET    | `src/routes/api/documents/[id]/metadata/+server.ts` | req  | `documents` (select metadata where id+owner) | `documentService.getDocumentMetadata` |

### `/api/public/documents/[id]`

| Method | File                                              | Auth | DB tables                                                                 | Service call                                                                       |
| ------ | ------------------------------------------------- | ---- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| GET    | `src/routes/api/public/documents/[id]/+server.ts` | anon | `documents` (select where id+is_public) JOIN `users` (owner display name) | `documentService.getPublicDocument`. Returns ambiguous 404 for missing OR private. |

### `/api/templates`

| Method | File                                  | Auth                   | DB tables                                                                      | Service call                                 |
| ------ | ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| GET    | `src/routes/api/templates/+server.ts` | opt (`guestAwareAuth`) | `templates` (list/filter/search), potentially joins `users` / `template_stars` | `getTemplateLibraryService().listTemplates`  |
| POST   | `src/routes/api/templates/+server.ts` | req                    | `documents` (ownership check), `templates` (insert)                            | `getTemplateLibraryService().createTemplate` |

### `/api/templates/[id]`

| Method | File                                       | Auth                                                     | DB tables                                             | Service call                     |
| ------ | ------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------- | -------------------------------- |
| GET    | `src/routes/api/templates/[id]/+server.ts` | anon (public read; served with ETag + CDN cache headers) | `templates` (select)                                  | `service.getTemplate(id, null)`  |
| PUT    | `src/routes/api/templates/[id]/+server.ts` | req                                                      | `templates` (update metadata where id+owner)          | `service.updateTemplateMetadata` |
| DELETE | `src/routes/api/templates/[id]/+server.ts` | req                                                      | `templates` (set `is_published=false` where id+owner) | `service.unpublishTemplate`      |

### `/api/templates/[id]/content`

| Method | File                                               | Auth | DB tables                                                                          | Service call                    |
| ------ | -------------------------------------------------- | ---- | ---------------------------------------------------------------------------------- | ------------------------------- |
| PUT    | `src/routes/api/templates/[id]/content/+server.ts` | req  | `templates` (update content/hash where id+owner), reads linked `documents.content` | `service.updateTemplateContent` |

### `/api/templates/[id]/import`
| Method | File | Auth | DB tables | Service call |
|---|---|---|---|---|
| POST | `src/routes/api/templates/[id]/import/+server.ts` | req | `templates` (select), `documents` (insert), `template_import_events` (insert), `template_user_recents` (upsert), `templates` (increment `import_count`) | `service.importTemplate` |

### `/api/templates/[id]/reset`

| Method | File                                             | Auth | DB tables                                                                       | Service call                       |
| ------ | ------------------------------------------------ | ---- | ------------------------------------------------------------------------------- | ---------------------------------- |
| PUT    | `src/routes/api/templates/[id]/reset/+server.ts` | req  | `templates` (select snapshot), `documents` (update content where owner matches) | `service.resetTemplateToPublished` |

### `/api/templates/[id]/star`

| Method | File                                            | Auth | DB tables                                                       | Service call             |
| ------ | ----------------------------------------------- | ---- | --------------------------------------------------------------- | ------------------------ |
| POST   | `src/routes/api/templates/[id]/star/+server.ts` | req  | `template_stars` (insert), `templates` (increment `star_count`) | `service.starTemplate`   |
| DELETE | `src/routes/api/templates/[id]/star/+server.ts` | req  | `template_stars` (delete), `templates` (decrement `star_count`) | `service.unstarTemplate` |

### `/api/templates/by-document/[documentId]`

| Method | File                                                           | Auth | DB tables                                      | Service call                      |
| ------ | -------------------------------------------------------------- | ---- | ---------------------------------------------- | --------------------------------- |
| GET    | `src/routes/api/templates/by-document/[documentId]/+server.ts` | req  | `templates` (select where document_id + owner) | `service.getTemplateByDocumentId` |

### `/api/templates/recents`
| Method | File | Auth | DB tables | Service call |
|---|---|---|---|---|
| GET | `src/routes/api/templates/recents/+server.ts` | req | `template_user_recents` JOIN `templates` (filtered by user); ordered by `last_imported_at DESC` | `service.listRecentTemplates` |

### `/api/templates/starred`

| Method | File                                          | Auth | DB tables                         | Service call                    |
| ------ | --------------------------------------------- | ---- | --------------------------------- | ------------------------------- |
| GET    | `src/routes/api/templates/starred/+server.ts` | req  | `template_stars` (select by user) | `service.getStarredTemplateIds` |

### `/api/metrics/export`

| Method | File                                       | Auth | DB tables                                                                                                                              | Service call                         |
| ------ | ------------------------------------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| POST   | `src/routes/api/metrics/export/+server.ts` | req  | `metrics_export_rate_limits` (upsert fixed-window), `document_export_events` (insert), `user_activity` (upsert on-conflict-do-nothing) | `allowExportRequest`, `recordExport` |

### `/api/cron/mark-template-official`

| Method | File                                                    | Auth | DB tables                                          | Service call                        |
| ------ | ------------------------------------------------------- | ---- | -------------------------------------------------- | ----------------------------------- |
| GET    | `src/routes/api/cron/mark-template-official/+server.ts` | cron | `templates` (update `quill_ref` / official marker) | `markTemplateOfficialByIdWithAppDb` |

### `/api/cron/repair-template`

| Method | File                                             | Auth | DB tables                                                    | Service call              |
| ------ | ------------------------------------------------ | ---- | ------------------------------------------------------------ | ------------------------- |
| GET    | `src/routes/api/cron/repair-template/+server.ts` | cron | `templates` + `documents` (read/update snapshot consistency) | `repairTemplateWithAppDb` |

### `/api/cron/seed-templates`

| Method | File                                            | Auth | DB tables                                                                                       | External                                                                      |
| ------ | ----------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| GET    | `src/routes/api/cron/seed-templates/+server.ts` | cron | `templates` (upsert official seeded templates), reads `users` for a system owner if provisioned | Outbound HTTP to self (`getSiteURL()`) to fetch manifest + template payloads. |

## Server-Rendered Load Functions (non-`/api` DB touches)

| File                                  | Auth                       | DB tables                                                                    | Purpose                                           |
| ------------------------------------- | -------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------- |
| `src/routes/+layout.server.ts`        | session read               | (Auth.js adapter internally may touch `users`/`accounts` on session refresh) | Exposes session + static manifests to every page. |
| `src/routes/+page.server.ts`          | req (when session present) | `documents` (list by owner)                                                  | Home/editor SSR preload.                          |
| `src/routes/doc/[id]/+page.server.ts` | anon                       | `documents` JOIN `users` (public only)                                       | Public document viewer.                           |

## Summary of Trust Boundaries

- **Public (anon)**: `/api/health`, `/api/public/documents/[id]`, `/api/templates/[id]` (GET), `/doc/[id]` (SSR page).
- **Guest-aware (opt)**: `/api/templates` (GET) — gated only when `PUBLIC_GUEST_MODE_DISABLED=true`.
- **Authenticated (req)**: all other `/api/*` handlers.
- **Cron-only (HMAC secret)**: `/api/cron/*` — `Authorization: Bearer $CRON_SECRET`, constant-time compared.
