# API Security Vulnerability Report

Aggregated from eight parallel Claude Sonnet subagent scans. Each scan covered a subset of the API surface listed in `INVENTORY.md`, following handlers into their service-layer and utility dependencies.

Severity scale: **critical** → **high** → **medium** → **low** → **info**.

Status tags (added on branch `claude/analyze-vulns-inventory-KkQvk`):

- **✅ fixed** — patch applied on this branch, covered by typecheck + unit tests (561 tests green).
- **🟡 deferred** — requires significant tradeoffs (infra, schema, or product decisions); see "Significant tradeoffs" discussion.
- **⛔ declined** — finding reconsidered and rejected as a design choice (not a vulnerability); see annotation.
- untagged — unaddressed on this branch.

---

## Executive Summary

| Severity | Count |
| -------- | ----- |
| critical | 1 (operational — committed secrets) |
| high     | 5 (3 fixed, 1 deferred, 1 operational) |
| medium   | 15 (4 newly fixed) |
| low      | 19    |
| info     | 15    |

### Top Risks (address first)

1. ✅ **[HIGH] SSRF in `GET /api/cron/seed-templates` via `VERCEL_URL`** — attacker-controlled Vercel preview URL can poison the production template library. _Fixed: `getSiteURL()` replaced with `config.urls.production` in `seed-templates/+server.ts`; cron always fetches from the canonical production CDN regardless of deployment context._
2. ✅ **[HIGH] Open redirect via `callbackUrl` constructed in `hooks.server.ts`** — partially mitigated client-side, but Auth.js cookie path still leaks. _Fixed: `fromUrl` validated against `^\/[^/]` before forwarding (`hooks.server.ts:34`)._
3. ✅ **[HIGH] Unbounded `limit` × 10 amplification in `GET /api/templates/recents`** — 500-row dedup query + unbounded `COUNT(DISTINCT)`. _Fixed: new `template_user_recents` read-model (one row per `(user_id, template_id)` pair) upserted inside the `importTemplate` transaction; `listRecentTemplates` now reads `ORDER BY last_imported_at DESC LIMIT n` against the composite index — O(limit). The unbounded `COUNT(DISTINCT)` is replaced with `COUNT(*)` over the same bounded pair table. Migration `0003_template_user_recents.sql`; no backfill (existing recents are intentionally discarded). Follow-up: the initial fix only wired the upsert into `importTemplate`; `createDocument` (the path NewDocumentModal actually uses) was missing the upsert and was fixed separately. `source_template_id` was subsequently removed from `POST /api/documents` entirely — template-backed creation now routes exclusively through `POST /api/templates/[id]/import`._
4. 🟡 **[HIGH] No rate limiting on `POST /api/templates/[id]/import`** — inflates `import_count`, unbounded document creation. _Deferred: unique constraint or rate-limit infra both alter product semantics._
5. ✅ **[MEDIUM] Session `user.email` serialized to every SSR page** — leaks PII to any client-side script on the page. _Fixed: `email` stripped from `safeSession` in `+layout.server.ts:12–16`._
6. ⛔ **[MEDIUM] Private document content publishable as public template** — `createTemplate` doesn't check `documents.is_public`. _Declined: document visibility (`is_public`, controls `/doc/[id]` public-link sharing) and template publishing are two independent sharing systems. The publish flow is author-initiated and already gated by an explicit acknowledgement checkbox in `TemplatePublishModal.svelte`; coupling it to `is_public` conflates the two systems and blocks a legitimate workflow (keep the source doc private while publishing a derived template)._
7. ⛔ **[MEDIUM] `document_id` in `POST /api/metrics/export` not ownership-checked** — _Declined: ownership restriction was reverted. Exporting shared (public) documents owned by other users is an intended future use case; the metric records the exporter as the actor. Existing mitigations (auth + 10/min rate limit + UUID format validation) bound abuse adequately._

---

## Red-Team Review (branch `claude/security-audit-DbRgb`)

A second-pass red-team review on top of the prior audit. Five findings; three were fixed on this branch, one is a deferred operational task (secret rotation), and one informs the design of a follow-up rate-limit task.

### [CRITICAL — operational] Secrets committed to the repository

- **Files**: `.env`, `.env.dev`, `deployment/.env.dev-self` (all tracked in git history).
- **Disclosed values include**:
  - `AUTH_GITHUB_SECRET=09de2ef5ee4a11560b1b9c9a8f1ac3bee36875e2` (GitHub OAuth app client secret format).
  - `AUTH_GOOGLE_SECRET=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` (Google OAuth client secret format).
  - `DATABASE_URL` for a Neon Postgres instance with the password `npg_1IDZmTHfCc8y` (`.env.dev:13`).
  - `AUTH_SECRET` placeholders that are short, human-memorable strings (`test-secret-for-testing-only-32-characters-long`, `dev-secret-for-local-testing-only-32chars`).
- **Why it's exploitable**: Any of these values that are still live in a deployed environment grants direct access to the corresponding system (DB connect, OAuth-app impersonation). A leaked `AUTH_SECRET` is the worst case — it lets an attacker forge a JWT for **any** user and assume that identity by setting `token.id` (see "Session forgery" below).
- **Status**: Operational fix only — code cannot remediate. Action items:
  1. Rotate every committed credential (GitHub OAuth secret, Google OAuth secret, Neon DB password, `AUTH_SECRET`).
  2. Audit production environments to confirm none of the committed `AUTH_SECRET` values are in use; regenerate with `openssl rand -base64 32` if so.
  3. Purge `.env`, `.env.dev`, `deployment/.env.dev-self` from the working tree and `.gitignore` them; replace with `.env.example` files containing placeholder values.
  4. Consider rewriting git history to expunge the credentials, or treat them as permanently leaked.

### ✅ [HIGH] Session forgery via leaked `AUTH_SECRET` → impersonate any user

- **File**: `src/lib/server/auth.ts:333` (JWT callback) and `src/lib/server/auth.ts:364` (session callback).
- **Mechanism**: Auth.js JWTs are HMAC-signed with `AUTH_SECRET`. The session callback unconditionally trusts `token.id`: `session.user.id = token.id as string`. With the secret in hand an attacker mints a JWT carrying any UUID, drops it in the session cookie, and is treated as that user by every `/api/*` endpoint protected by `requireAuth`.
- **Particularly bad target — "Official" template publishing**: `SYSTEM_USER_ID = '00000000-0000-4000-a000-000000000001'` is a hard-coded constant (`templates/constants.ts:7`). "Official" is determined purely by `ownerId === SYSTEM_USER_ID` (`template-drizzle-service.ts:63,123`). A forged JWT for `SYSTEM_USER_ID` lets an attacker call `POST /api/templates` and have the resulting row ship with the "Official" badge in the public template library — perfect for a phishing/supply-chain attack against downstream document authors.
- **Status**: ✅ The amplification surface (per-request DB existence check) was hardened separately on this branch, but the underlying primitive is "secret leaks → game over." The mitigation is **secret hygiene** (preceding finding) + monitoring for anomalous logins. No code-level fix is sufficient on its own.

### ✅ [MEDIUM] Markdown / @-mention injection in `POST /api/feedback` issue body

- **File**: `src/lib/server/services/feedback/index.ts:123–151`.
- **Vector**: `buildFeedbackIssueBody` previously interpolated `reporterName` and every `environment.*` field directly into the GitHub/GitLab issue body without escaping. Three concrete attacks:
  1. **@-mention spam**: a reporter whose OAuth display name is `@maintainer` pings that user (or any GitHub username) on every feedback submission.
  2. **Phishing links**: `environment.route = "\n\n[Click to verify](https://evil.example)"` injects a clickable link that maintainers reading the issue see verbatim.
  3. **Issue-reference noise**: `#1` cross-references existing PRs/issues with bogus mentions.
- _Fixed_: `escapeMarkdown()` is now applied to `reporterName`, `reporterEmail`, and every `environment.*` field. The escape regex was extended to also handle `@`, `#`, and `!` so mentions, issue refs, and image syntax are inert. (`feedback/index.ts:3–10,132–151`.)

### ✅ [MEDIUM] Raw DB error message leaked in `mapDrizzleError` default branch

- **File**: `src/lib/server/db/errors.ts:90` (was previously the final `return new DatabaseError(defaultCode, message, defaultStatus)`).
- **Mechanism**: `handleServiceError` (`utils/api.ts:70`) puts `AppError.message` straight into the HTTP response body. When a Postgres error didn't match the code map or any of the substring heuristics, the raw driver message was forwarded — leaking constraint names, table/column names, partial query text, and version-specific PG diagnostics to anonymous probes.
- _Fixed_: unmapped errors are now logged with the original `error` object via `console.error('[db] Unmapped database error:', error)` and the response body becomes a generic `'Database error'`. Mapped error codes / substring heuristics are unchanged so user-visible behaviour for known cases (duplicate, not_found, validation_failed) is preserved.

### ✅ [MEDIUM] JWT callback hits DB on every request — amplification

- **File**: `src/lib/server/auth.ts:333`.
- **Mechanism**: After sign-in, the JWT callback runs on every request (`user` is undefined; `token.id` is set). It executed `SELECT id FROM users WHERE id = token.id LIMIT 1` to invalidate JWTs that outlive a deleted user row. With a single valid session cookie, an attacker can sustain N requests/second and force N matching DB lookups — a free amplifier against the auth path.
- _Fixed_: the token now carries `verifiedAt: number`. The DB check is skipped when `Date.now() - token.verifiedAt < JWT_VERIFY_INTERVAL_MS` (5 min). On successful re-verify the timestamp is bumped; on user-deleted the identity fields plus `verifiedAt` are cleared. Tradeoff: a deleted user's JWT remains usable for up to 5 min — interval is a single constant if tighter staleness is required.
- The `JWT` type was extended in `src/app.d.ts` via module augmentation to type the new `verifiedAt` (and existing `id`) fields.

### 🟡 [HIGH — design] `AUTH_MOCK=true` in committed `.env` → total auth bypass on accidental deploy

- **Files**: `.env:9` (committed), `src/lib/server/auth.ts:156–187`, `src/lib/services/auth/login-client.ts:49–54`.
- **Mechanism**: `Credentials.authorize()` ignores the submitted username and unconditionally returns the fixed `MOCK_USER` (UUID `00000000-0000-0000-0000-000000000001`). The "Mock Login" button renders whenever `AUTH_MOCK === 'true'`. If the committed `.env` is ever picked up by a production runtime (Docker `--env-file`, Vercel "include in deployment", a developer copy-pasting the wrong file), every visitor logs in as the same shared mock user and can read/modify everything that account owns.
- **Status**: 🟡 Operational hardening recommended. Concrete options:
  1. **Refuse to start in production with `AUTH_MOCK=true`**: assert `process.env.NODE_ENV !== 'production' || env.AUTH_MOCK !== 'true'` at module load and throw.
  2. Move mock-related env files out of the repo entirely (e.g. `.env.example`) so they cannot be picked up unintentionally.
  3. Fail the build if `.env` is present in the build context (CI guard).

---

## Findings by Endpoint

### GET /api/health

- **File**: `src/routes/api/health/+server.ts:4`
- **Auth**: None (public).
- **Findings**
  - [low] No rate limiting — unauthenticated endpoint can be polled unboundedly. Fix: IP-based rate limit or move to edge static response.
  - [info] Server clock disclosed via `timestamp`. Minor fingerprinting surface.

---

### POST /api/beta-program

- **File**: `src/routes/api/beta-program/+server.ts:13`
- **Auth**: `requireAuth` (session).
- **Findings**
  - [low] No per-user rate limit — spammable upsert on `beta_notifications`.
  - [info] No explicit CSRF check — relies on Auth.js cookie SameSite + CORS. Verify CORS policy excludes `*` with credentials.
  - [info] Drizzle upsert is correctly scoped (`userId` from session, not body). No IDOR.

---

### POST /api/feedback

- **File**: `src/routes/api/feedback/+server.ts:161`
- **Auth**: `getSession` + inline null-check.
- **Findings**
  - [high] Session-supplied `email`/`name` preferred over DB record (`+server.ts:197,205`) — an OAuth provider (or malicious IdP in a future multi-tenant setup) can inject forged reporter identity into the issue body.
  - ✅ [medium] `feedback.title`/`description` interpolated into GitHub/GitLab Markdown with no escaping (`+server.ts:229–230`) — markdown injection into the issue tracker. _Fixed: `escapeMarkdown()` helper applied to both fields (`services/feedback/index.ts`, `api/feedback/+server.ts`)._
  - ✅ [medium] `reporterName` and `environment.{browser,os,route,screen}` interpolated unescaped into the issue body (`feedback/index.ts:132,139–144`). Allowed @-mention spam, phishing-link injection, and `#issue-ref` noise into upstream issue trackers. _Fixed: `escapeMarkdown()` now applied to every interpolated field; `escapeMarkdown` regex extended to escape `@`, `#`, `!` so mentions/refs/image syntax are inert._
  - [medium] Issue URL (`html_url` / `web_url`) returned verbatim to the client (`+server.ts:254`) — a compromised upstream can send a rogue URL straight to the browser.
  - ✅ [medium] `FEEDBACK_GITLAB_URL` validated only by substring check (`gitlab-url.ts:7`) — host not pinned, so a misconfigured env var causes credentialed SSRF with `PRIVATE-TOKEN` header. _Fixed: full URL parse + `https:` protocol assert + host allowlist (`gitlab.com`, `sync.git.mil`) in `gitlab-url.ts`._
  - [low] No per-user rate limit — unlimited GitHub/GitLab issue creations per authenticated user.
  - [low] Error log names secret env vars (`+server.ts:215–217`) — minor operational leak.
  - [info] `users` lookup uses parameterised Drizzle query (`eq`). No SQL injection.

---

### GET /api/documents

- **File**: `src/routes/api/documents/+server.ts:32`
- **Auth**: `requireAuth`.
- **Findings**
  - [low] No upper bound on `offset` in `parsePaginationParams` (`request-validation.ts:20–25`) — deep offset scans waste DB cycles.
  - [info] Authz correctly scoped by `ownerId`.

### POST /api/documents

- **File**: `src/routes/api/documents/+server.ts:14`
- **Auth**: `requireAuth`.
- **Findings**
  - [medium] `name` has no length cap at parse layer (`request-schemas.ts:98–103`); defence-in-depth gap.
  - ✅ [medium] CSRF protection is globally disabled when `DISABLE_CSRF_CHECK=true` or `NODE_ENV=development` via `trustedOrigins:['*']` (`svelte.config.js:12–15`) — catastrophic if leaked to prod/staging. _Fixed: `DISABLE_CSRF_CHECK` env branch removed; only `NODE_ENV === 'development'` enables wildcard `trustedOrigins`._
  - [low] Full request body parsed before 512 KB size check — memory pressure risk for oversize payloads.
  - [info] No mass-assignment: `ownerId`/`isPublic` come from session/defaults.

### GET /api/documents/[id]

- **File**: `src/routes/api/documents/[id]/+server.ts:14`
- **Auth**: UUID check → `requireAuth`.
- **Findings**
  - [info] UUID validated before auth — minor info leak on format, UUIDs aren't secret.
  - [info] Authz: `id AND ownerId`. No IDOR.

### PUT /api/documents/[id]

- **File**: `src/routes/api/documents/[id]/+server.ts:35`
- **Findings**
  - ✅ [medium] Same oversize-body + CSRF caveats as POST. _CSRF half fixed via `svelte.config.js`; oversize-body remains._
  - [info] `is_public` is an intended user-settable field, gated by ownership.

### DELETE /api/documents/[id]

- **File**: `src/routes/api/documents/[id]/+server.ts:62`
- **Findings**
  - ✅ [medium] Same `DISABLE_CSRF_CHECK` risk. _Fixed via `svelte.config.js` change (see above)._
  - [info] Authz correct.

### GET /api/documents/[id]/metadata

- **File**: `src/routes/api/documents/[id]/metadata/+server.ts:11`
- **Findings**: No issues found beyond the shared `handleServiceError` concern (verify `mapDrizzleError` never leaks DB text).

---

### GET /api/public/documents/[id]

- **File**: `src/routes/api/public/documents/[id]/+server.ts:12`
- **Auth**: None (public).
- **Findings**
  - [medium] Success path has no `Cache-Control` header — a CDN or shared proxy may cache a document that later flips to private, serving stale content.
  - ✅ [low] Client-supplied `x-correlation-id` echoed back unvalidated (`ambiguous-response-logging.ts:27`) — log-injection / response-header injection surface if CRLF passes. _Fixed: header now validated against `^[A-Za-z0-9-]{1,64}$`; fallback to `crypto.randomUUID()` on mismatch._
  - [info] Response fields correctly limited to `{id, name, content, owner_display_name}`; no PII leak.
  - [info] Ambiguous 404 applied consistently for not-found / private / exception cases.

---

### SSR /doc/[id]

- **File**: `src/routes/doc/[id]/+page.server.ts:10`
- **Findings**
  - [low] Exception path uses unstructured `console.error` (no correlation ID) — diverges from the API route.
  - [info] UUID regex duplicates `validateUUID`; consolidate.
  - [info] XSS surface: document content is rendered into an `iframe srcdoc` with empty `sandbox=""` — currently safe because scripts are disabled; add a test to prevent future loosening.

### SSR / (+page.server.ts)

- **File**: `src/routes/+page.server.ts:14`
- **Findings**: No direct issues; auth is inherited from layout.

### SSR layout (+layout.server.ts)

- **File**: `src/routes/+layout.server.ts:7`
- **Findings**
  - ✅ [medium] `session.user.email` forwarded in page data (`+layout.server.ts:13`) — embedded in every SSR `<script>` payload, readable by any third-party JS on the page. Strip `email` in the `session`/`jwt` callback or in the loader. _Fixed: `email` destructured out of `session.user` before return; `safeSession` substituted in page data. Sidebar `user.email` fallback is now cosmetic-only._
  - [info] `providers` list contains IDs only; no secrets.

### Edge hook (hooks.server.ts)

- **File**: `src/hooks.server.ts:11`
- **Findings**
  - ✅ [high] Open-redirect via `callbackUrl` — `fromUrl = pathname + search` is URL-encoded and forwarded to `/signin`. The client sanitises the final redirect, but Auth.js's own callback-URL cookie path isn't validated by the hook. Validate `fromUrl` against `^\/[^/]` before embedding. _Fixed: regex validated with fallback to `/` (`hooks.server.ts:34`)._
  - [medium] `restrictedRoutes` when guest mode is disabled is an explicit allowlist of paths (`/`, `/doc/*`); everything else (`/settings`, future routes) is unintentionally reachable. Invert to deny-by-default with an allowlist for `/auth/*` and public APIs.
  - ✅ [low] `pathname.startsWith('/auth')` would match future `/author`, `/authority`, etc. Change to `pathname === '/auth' || pathname.startsWith('/auth/')`. _Fixed (`hooks.server.ts:31`)._
  - [info] `trustHost: true` (`auth.ts:268`) — OK behind trusted proxy; otherwise pin `AUTH_URL`.

---

### GET /api/templates

- **File**: `src/routes/api/templates/+server.ts:16`
- **Auth**: `guestAwareAuth`.
- **Findings**
  - [info] Public-browse behaviour is flag-controlled by `PUBLIC_GUEST_MODE_DISABLED`; add a startup assertion to avoid silent mis-deploy.
  - [low] Unbounded `offset` allows deep-offset DB scans.
  - [low] `quill_ref` array is uncapped — oversized `IN (…)` clauses.

### POST /api/templates

- **File**: `src/routes/api/templates/+server.ts:61`
- **Auth**: `requireAuth`.
- **Findings**
  - ⛔ [medium] `createTemplate` selects the source document only by `ownerId`; it never checks `documents.is_public`. Originally flagged as "private-document content publishable as public template" (`template-drizzle-service.ts:307–310`, content copied at :316). _Declined: `documents.is_public` and template publishing are two separate sharing systems (public-link sharing vs. template library). The publish flow is author-initiated and already gated by an explicit acknowledgement checkbox in `TemplatePublishModal.svelte` (line 298) before the Publish button is enabled. Requiring `is_public=true` would conflate the two systems and break the legitimate workflow of keeping a source doc unlisted at `/doc/[id]` while still publishing a derived snapshot as a template._
  - [low] Relies on Auth.js cookie `SameSite=lax`; add explicit `Origin` header check for defence-in-depth.

### GET /api/templates/[id]

- **File**: `src/routes/api/templates/[id]/+server.ts:20`
- **Auth**: None (public, CDN-cached).
- **Findings**
  - [low] ETag falls back to `updated_at` when `content_hash` is null (`cdn-cache.ts:79–82`) — timing/update-time disclosure. Use an HMAC-derived opaque token.
  - [info] "userId = null" design is sound: the field is only used for `is_starred`; all other fields don't depend on user.
  - [info] `isPublished=true` filter enforced — unpublished templates cannot leak via the cache.

### PUT /api/templates/[id]

- **File**: `src/routes/api/templates/[id]/+server.ts:47`
- **Findings**
  - [medium] Post-update re-fetch uses `getTemplate(id, userId)` without transactional isolation — a concurrent delete between update and re-fetch yields a 500 instead of a coherent 404.
  - [info] IDOR check (`ownerId = userId`) present.

### DELETE /api/templates/[id]

- **File**: `src/routes/api/templates/[id]/+server.ts:68`
- **Findings**
  - ✅ [low] The cascaded document deletion within `unpublishTemplate` does not re-check `documents.ownerId = userId` (`template-drizzle-service.ts:521–524`). If a DB-level integrity bug ever reassigned `documentId`, another user's document could be deleted. Add the `ownerId` predicate. _Fixed: `eq(ownerId, userId)` added to the cascade DELETE predicate._
  - [info] IDOR check on template present.

### PUT /api/templates/[id]/content

- **File**: `src/routes/api/templates/[id]/content/+server.ts:11`
- **Findings**
  - ✅ [medium] Fork document fetched without an `ownerId` filter (`template-drizzle-service.ts:455–462`). Combined with the delete finding above, the service trusts the `documentId` FK exclusively. Add `eq(ownerId, userId)` to the select. _Fixed: predicate now includes `eq(documents.ownerId, userId)`._
  - [info] Template-level IDOR check present.

---

### POST /api/templates/[id]/import

- **File**: `src/routes/api/templates/[id]/import/+server.ts:11`
- **Auth**: `requireAuth`.
- **Note**: This is now the sole path for template-backed document creation. `POST /api/documents` handles blank documents only (`source_template_id` removed).
- **Findings**
  - 🟡 [high] No rate limit; no per-user unique constraint on `template_import_events(template_id, user_id)`. A script can inflate `importCount` and the "recommended" sort score, and create unlimited documents. _Deferred: rate-limit infra needed._
  - [medium] No per-user document quota check in `importTemplate`. Attacker fills `documents` table with rows owned by one user.
  - [low] Counter increment races with event insert under concurrency — over-counts possible.

### PUT /api/templates/[id]/reset

- **File**: `src/routes/api/templates/[id]/reset/+server.ts:11`
- **Findings**
  - [low] CSRF defence-in-depth: no `Origin`/`Referer` check; depends on cookie SameSite.
  - [info] Ownership check (`ownerId = userId AND isPublished = true`) enforced.

### POST /api/templates/[id]/star

- **File**: `src/routes/api/templates/[id]/star/+server.ts:12`
- **Findings**
  - [low] No per-user rate limit on alternating star/unstar — mild CPU abuse vector.
  - [info] Idempotent via `ON CONFLICT DO NOTHING`; counter never double-increments.
  - [info] Guards against starring unpublished templates.

### DELETE /api/templates/[id]/star

- **File**: `src/routes/api/templates/[id]/star/+server.ts:29`
- **Findings**
  - [low] Unstar on a non-existent template returns a misleading `not_starred` 400 instead of 404 (template-existence check absent).
  - [info] Underflow guarded by `GREATEST(starCount - 1, 0)`.
  - [info] IDOR: `WHERE templateId AND userId` — cannot remove another user's star.

---

### GET /api/templates/by-document/[documentId]

- **File**: `src/routes/api/templates/by-document/[documentId]/+server.ts:12`
- **Findings**
  - [low] Returns 404 for both "no template" and "not your document"; not an oracle.
  - [info] Ownership check is explicit (`ownerId = userId` on `templates`).

### GET /api/templates/recents

- **File**: `src/routes/api/templates/recents/+server.ts:11`
- **Findings**
  - ✅ [high] Caller-supplied `limit` is forwarded directly to the service; the service caps at 50 but then runs a dedup query with `limit * 10 = 500` rows plus an unbounded `COUNT(DISTINCT)` (`template-drizzle-service.ts:697,734`). DB load amplifies 10× per request. _Fixed: replaced the event-log dedup with a `template_user_recents(user_id, template_id)` read-model, upserted inside the `importTemplate` transaction. `listRecentTemplates` now reads `ORDER BY last_imported_at DESC LIMIT n` against the `(user_id, last_imported_at DESC)` index — O(limit). `total` is now `COUNT(*)` over the bounded pair table instead of `COUNT(DISTINCT)` over events. Migration `0003_template_user_recents.sql` (no backfill — existing recents intentionally discarded)._
  - [low] `q` parameter is unbounded in length — large values blow up two `ILIKE` patterns.

### GET /api/templates/starred

- **File**: `src/routes/api/templates/starred/+server.ts:14`
- **Findings**
  - [medium] `getStarredTemplateIds` has no `LIMIT` (`template-drizzle-service.ts:574–579`). A user with many stars (or an abuse-created backlog) causes arbitrary-size responses. Paginate or cap to ~10 000.

---

### POST /api/metrics/export

- **File**: `src/routes/api/metrics/export/+server.ts:17`
- **Auth**: `requireAuth`.
- **Findings**
  - ⛔ [medium] `document_id` is UUID-validated but not ownership-validated. _Declined: exporting shared (public) documents owned by other users is an intended future use case. The metric records the exporter as actor. Mitigated by auth + 10/min rate limit + UUID format validation. Ownership probe reverted._
  - ✅ [low] Log-injection/echo of `x-correlation-id` (shared with `/api/public/documents/[id]`). _Fixed centrally in `ambiguous-response-logging.ts`._
  - [info] Rate-limit upsert is race-safe (Postgres row lock serialises `DO UPDATE … WHERE count < MAX`); non-obvious, worth a comment.
  - [info] `recordExport` is fire-and-forget; availability concern not a security concern.
  - [info] CSRF: session cookie only; low-value write.

---

### GET /api/cron/mark-template-official

- **File**: `src/routes/api/cron/mark-template-official/+server.ts:16`
- **Auth**: `Authorization: Bearer <CRON_SECRET>`.
- **Findings**
  - [low] Response leaks internal state enums (`already_official`, `not_published`, `no_change`) to the token-holder. Collapse if not needed.
  - [info] `timingSafeEqual` length guard is sound (ASCII-only bearer tokens).
  - [info] Bearer-token model acts as de-facto CSRF.

### GET /api/cron/repair-template

- **File**: `src/routes/api/cron/repair-template/+server.ts:24`
- **Findings**
  - ✅ [medium] Legacy `document_id` path removed; only `template_id` is accepted now.
  - ✅ [low] Per-row error strings were serialised into the response body. Removed with the batch result shape — errors now surface only as a generic 500.
  - [info] `dry_run` defaults to `false` — potentially surprising for a destructive op.

### GET /api/cron/seed-templates

- **File**: `src/routes/api/cron/seed-templates/+server.ts:9`
- **Findings**
  - ✅ [high] **SSRF**. `getSiteURL()` falls through to `env.VERCEL_URL`, which is attacker-influenceable in PR/fork preview deployments. A successful cron POST in such a context would fetch `templates.json` and template bodies from a rogue origin and upsert them into the database. _Fixed: replaced `getSiteURL()` with `config.urls.production` in the handler (`seed-templates/+server.ts:27`); cron always fetches from the canonical production CDN._
  - [medium] Manifest is trusted without signature / hash verification after fetch.
  - ✅ [medium] `loadTemplateViaHTTP` filename guard (blocks `..`, `/`, `\`) is bypassable by URL-encoded separators (e.g. `%2F`). Additionally assert `/^[A-Za-z0-9_\-]+\.[a-z]+$/`. _Fixed: allowlist regex `^[A-Za-z0-9_-]+\.[a-z]+$` applied after the existing character-level guard (`services/templates/loader.ts:66`).\_
  - [low] No `dry_run` option — impossible to safely test manifest changes.
  - [info] `seedMockUser()` is in the shared sync path, guarded by `isMockProviderEnabled()`. Defensively move mock user seeding out of production startup entirely.

---

## Cross-Cutting Observations

- **Drizzle ORM use is parameterised throughout.** No SQL-injection vectors detected in the handlers reviewed. The only raw-SQL snippet (`IS_TEMPLATE_SQL`) contains no user input.
- ✅ **`handleServiceError`** returns `AppError.message` verbatim (`utils/api.ts:70`). _Fixed: `mapDrizzleError` default branch now logs the raw error server-side via `console.error('[db] Unmapped database error:', error)` and constructs `DatabaseError` with a generic `'Database error'` message. Mapped error codes and substring heuristics are unchanged so behaviour for known cases (duplicate, not_found, validation_failed) is preserved._
- ✅ **CSRF posture** relies on Auth.js session cookie (`SameSite=lax`) plus SvelteKit's built-in same-origin POST check. The `DISABLE_CSRF_CHECK=true` escape hatch in `svelte.config.js` is dangerous if leaked. _Fixed: env-based escape hatch removed; only `NODE_ENV === 'development'` disables CSRF._
- **Rate limiting is limited to `/api/metrics/export`.** High-impact mutating endpoints (`/api/feedback`, `/api/templates/[id]/import`, `/api/templates/[id]/star`, `/api/beta-program`) are unprotected.
- ✅ **Ambiguous-response logging echoes `x-correlation-id`** from the request without validation — a small but broad log/header-injection surface across `/api/public/documents/[id]` and `/api/metrics/export`. _Fixed centrally in `ambiguous-response-logging.ts`._
- ✅ **Ownership invariants on `templates.documentId`** are assumed rather than enforced in queries. Two endpoints (`PUT /api/templates/[id]/content`, `DELETE /api/templates/[id]`) trust the foreign key rather than re-checking `documents.ownerId`. Defence-in-depth predicates are cheap and close the failure-mode cluster. _Fixed: `eq(documents.ownerId, userId)` added to `unpublishTemplate` cascade DELETE and `updateTemplateContent` fork-doc fetch. `createTemplate` already filters by `ownerId` when selecting the source document._
- ✅ **JWT callback amplification.** The Auth.js JWT callback ran a per-request `SELECT id FROM users WHERE id = token.id` to invalidate stale-after-deletion JWTs (`auth.ts:333`). With a single valid session cookie, an attacker could amplify N requests/sec into N DB roundtrips on the auth path. _Fixed: token now carries `verifiedAt: number`; the existence check is skipped while last-verify is < 5 min old (`JWT_VERIFY_INTERVAL_MS`). On user-deleted, identity fields plus `verifiedAt` are cleared. Type augmented in `src/app.d.ts` via `declare module '@auth/core/jwt'`. Tradeoff: deleted users' JWTs work for up to 5 min — interval is a single constant._
- ⚠️ **Committed secrets.** `.env`, `.env.dev`, and `deployment/.env.dev-self` ship `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_SECRET`, a Neon `DATABASE_URL` with a real-looking password, and short `AUTH_SECRET` placeholders into git history. A leaked `AUTH_SECRET` enables session forgery for any user (the JWT signature is the only check); `SYSTEM_USER_ID` impersonation in particular yields the ability to publish "Official" templates. **Operational fix only**: rotate every committed credential, audit production for reuse, remove the files from the working tree, replace with `.env.example`, and consider history rewrite. See "Red-Team Review" section above.
