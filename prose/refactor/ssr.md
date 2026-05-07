# SSR Layer Refactor Audit

Scope: `src/hooks.server.ts`, `src/routes/+layout.server.ts`,
`src/routes/+page.server.ts`, `src/routes/doc/[id]/+page.server.ts`,
`src/routes/manifest.webmanifest/+server.ts`, `src/lib/server/auth.ts`,
`src/lib/server/auth-env.ts`, `src/lib/server/startup.ts`,
`src/lib/server/quills-manifest.ts`, `src/lib/server/oidc/*`,
`src/lib/server/services/auth/auth-providers.ts`, `src/app.d.ts`.

---

## Auth module: re-exports and wrappers around `auth-env`

**Category:** redundant / vestigial · **Leverage:** medium

**Location:**
- `src/lib/server/auth.ts:18` — `import { isMockProviderEnabled, MOCK_USER } from './auth-env';`
- `src/lib/server/auth.ts:57-63` — re-exports `isMockProviderEnabled` and `MOCK_USER`.
- `src/lib/server/auth.ts:68-70` — `isMockAuthEnabled()` is a one-line wrapper
  around `isMockProviderEnabled()`. Its only caller is
  `src/lib/server/services/auth/auth-providers.ts:22`.

**What.** Three layers deep for one boolean check:
`auth-env.isMockProviderEnabled → auth.ts re-export → auth.ts isMockAuthEnabled → consumer`.

**Direction.** Delete the re-exports and `isMockAuthEnabled()`. Import the
originals directly from `auth-env`. The `MOCK_USER` re-export is only there to
support the wrapper; remove both.

---

## Provider-configured checks are duplicated

**Category:** redundant · **Leverage:** medium

**Location:** `src/lib/server/auth.ts:75-97` exports `isGitHubConfigured()`,
`isGoogleConfigured()`, `isUsafOidcConfigured()`. The same three checks are
then invoked inline inside `getProviders()` at lines 191/196/201 **and** again
inside `src/lib/server/services/auth/auth-providers.ts:22+`.

**Why it smells.** Two modules decide "which auth providers are available";
they could easily disagree after a config change (e.g. renaming an env var).
`auth-providers.ts` exists to surface provider metadata to the sign-in page,
which duplicates the work `getProviders()` already does at startup.

**Direction.** Make `getProviders()` the single decision point. Have it return
provider metadata (id, label, configured?) in addition to the Auth.js provider
objects. `auth-providers.ts` then becomes a thin projection, not a second
oracle.

---

## Cookie-prefix hashing is one-shot, over-built

**Category:** over-engineered · **Leverage:** low

**Location:** `src/lib/server/auth.ts:29,241-262`.

**What.** `getAutoCookiePrefix()` is a 19-line function whose behavior is:
"if `AUTH_COOKIE_PREFIX` is set, use it; otherwise hash driver + URL (or a
per-process nonce for in-memory pglite) into an 8-char suffix." Called exactly
once at module load (`const cookiePrefix = getAutoCookiePrefix();`).

**Why it smells.** The function, the `pgliteNonce` module-level constant, and
the hashing all exist to solve one specific problem (in-memory pglite restarts
reusing old JWTs). That is a real problem, but it's currently expressed as
indirection without a design doc.

**Direction.**
- Inline the logic directly into the auth config since it's used once.
- Drop a short comment at the call site explaining *why* the pglite-memory
  branch needs a per-process nonce (this will save the next reader a
  15-minute spelunk).

---

## Startup module: double-tracked state + retry race

**Category:** over-engineered / smelly · **Leverage:** medium

**Location:** `src/lib/server/startup.ts:12-45`.

**What.** Tracks startup with both a `startupPromise: Promise<void> | null`
and a `startupComplete: boolean`. On error, `startupPromise` is reset to
`null` inside a `.catch()` handler, then the error is rethrown — to retry on
the next request.

**Why it smells.**
- The promise alone is sufficient state. The boolean is redundant.
- The retry window has a subtle race: between the `.catch()` running (setting
  `startupPromise = null`) and the next request observing it, any in-flight
  awaiters are already being rejected. Callers can see inconsistent state.

**Direction.** Keep only `startupPromise`. Decide whether startup is
retryable:
- If yes, wrap the state in a small `LazyAsyncInit` helper that guarantees
  single-flight retry on rejection (or use a proven utility).
- If no, let the promise reject permanently and surface the error loudly —
  this is a cold-start concern, not a per-request concern.

---

## Session callback does too much

**Category:** smelly · **Leverage:** medium

**Location:** `src/lib/server/auth.ts:364-374`.

**What.** The Auth.js `session` callback simultaneously:
1. Copies `token.id` onto `session.user.id`.
2. Fires `recordActivity(token.id as string)` for daily-active-user metrics
   (no `await`, no `void`).
3. Handles the token-invalidated case by setting `session.user.id = ''`.

**Why it smells.**
- Every authenticated request triggers a background DB write; there's no
  sampling, no rate limit, and no per-user debounce.
- Bare `recordActivity(...)` looks like a forgotten `await`.
- Identity invalidation (`session.user.id = ''`) in a callback named
  `session` mixes enrichment with invalidation side effects.

**Direction.**
- Prefix the metric call with `void` to signal intent.
- Move DAU tracking to a narrower surface (e.g. a dedicated `+layout.server.ts`
  beacon, or debounced inside `recordActivity` using a cache). The session
  callback is the hottest path in the system.
- Consider splitting the identity-invalidation branch into the JWT callback
  where it logically belongs.

---

## OIDC claims schema logger uses module-level mutable state

**Category:** smelly · **Leverage:** low

**Location:** `src/lib/server/auth.ts:32,118-127`.

**What.** `let usafOidcClaimsSchemaLogged = false;` at module scope; flipped
to `true` the first time a USAF OIDC login completes, inside the provider's
`profile()` callback, so the schema is logged only once per process.

**Why it smells.**
- Startup-time concern expressed as per-request runtime state.
- Under multi-process or serverless deployment, each instance will log on its
  first USAF login, which is noisy but not broken — the "log once" guarantee
  isn't a real guarantee.
- The flag is a magnet for future callers that assume log-once semantics.

**Direction.** Log the schema unconditionally in `startup.ts` (or gate behind
a debug env var). Delete the flag.

---

## Session email stripping

**Category:** smelly · **Leverage:** medium

**Location:** `src/routes/+layout.server.ts:7-17`.

```ts
const { email: _email, ...userWithoutEmail } = session.user;
void _email;
safeSession = { ...session, user: userWithoutEmail };
```

**Why it smells.**
- Privacy filtering is a cross-cutting concern being enforced in the layout
  loader. Any other loader that returns a session still leaks email.
- The `void _email` trick exists only to silence the unused-variable lint.
- The stripping runs on every layout load, but the original `session.user`
  is still accessible via `locals.auth()` everywhere else.

**Direction.** Move stripping into the Auth.js `session` callback so the
session object never contains `email` once it leaves the auth boundary. Then
the layout loader returns `session` unchanged, and every consumer (API routes,
other loaders) is safe by default. If `email` *is* needed server-side, fetch
it from the database by `user.id` — don't smuggle it through the session.

---

## `restrictedRoutes.some(Boolean)` guard mode predicate

**Category:** smelly · **Leverage:** low

**Location:** `src/hooks.server.ts:24-33`.

**What.**
```ts
const restrictedRoutes = [pathname === '/', pathname.startsWith('/doc/')];
// …
if (restrictedRoutes.some(Boolean) && !isAllowed) { … }
```

**Why it smells.** The array is a list of booleans, not a list of routes;
`some(Boolean)` is a disguised OR. Any reader has to trace backwards to see
what the predicate actually tests.

**Direction.**
```ts
const isRestricted = pathname === '/' || pathname.startsWith('/doc/');
if (isRestricted && !isAllowed) { … }
```

---

## Duplicate CORS header write for OPTIONS

**Category:** redundant · **Leverage:** trivial

**Location:** `src/hooks.server.ts:56,65`.

**What.** `Access-Control-Allow-Methods: 'GET, HEAD, POST, PUT, DELETE, OPTIONS'`
is written into the OPTIONS short-circuit Response and then written again on
the main response path after the hook returns. Only one write is reached per
request, but both are maintained.

**Direction.** Drop the header from the OPTIONS branch and let the later
`response.headers.set(...)` cover both paths.

---

## Vercel detection duplicated

**Category:** redundant · **Leverage:** low

**Location:**
- `src/lib/server/startup.ts:10` — `const isVercel = !!env.VERCEL;`
- `src/routes/+layout.server.ts:22` — `isVercel: !!env.VERCEL,`

**What.** Same env check in two files, serving two purposes (startup decides
whether to load templates over HTTP vs filesystem; layout exposes the flag to
the client).

**Direction.** Factor into `src/lib/config/environment.ts` (or similar)
`export const isVercelEnvironment = !!env.VERCEL;` and import both places.
Keeps the source of truth single.

---

## Duplicate 404 error path in doc loader

**Category:** redundant · **Leverage:** trivial

**Location:** `src/routes/doc/[id]/+page.server.ts:20-39`.

**What.** The loader has two branches that both end with
`error(404, { message: 'Document not found' })`: one for the "document
returned null" case, one for the catch-all exception handler.

**Direction.** Validate the UUID and call the service without a try/catch;
let `error(404, …)` throw naturally. If a broader catch is needed, log and
re-throw the original error rather than collapsing everything to 404 — today
a 500-class failure reads to the client as a missing document, which is
misleading.

---

## Session re-fetch via `event.parent()` vs `locals.auth()`

**Category:** smelly · **Leverage:** trivial

**Location:**
- `src/routes/+layout.server.ts:8` uses `event.locals.auth()`.
- `src/routes/+page.server.ts:19-20` uses `const { session } = await event.parent();`

**What.** Two loaders, two different conventions for reaching the same
session. The `+page.server.ts` comment justifies `parent()` as "cleaner and
explicit", which is a taste call, not a rule.

**Direction.** Pick one and apply consistently. `locals.auth()` is the lower-
indirection choice; `parent()` communicates "reuse layout data" more clearly.
Either is fine; mixed is not.

---

## `parseBootstrapPointer` single-use helper

**Category:** over-engineered · **Leverage:** trivial

**Location:** `src/lib/server/quills-manifest.ts:20-50`.

**What.** A 12-line helper that parses either plain text or JSON to extract a
manifest filename. Called exactly once from the exported
`loadQuillManifestFromStatic()`.

**Direction.** Inline. The error paths are the interesting content; they'll
read fine as inline throws.

---

## `manifest.webmanifest` cache constants

**Category:** over-engineered · **Leverage:** trivial

**Location:** `src/routes/manifest.webmanifest/+server.ts:4-7`.

**What.** Four local `const` values (`BROWSER_CACHE_SECONDS`,
`CDN_CACHE_SECONDS`, `STALE_WHILE_REVALIDATE_SECONDS`,
`STALE_IF_ERROR_SECONDS`) used once each in a Cache-Control string.

**Direction.** Inline with comments naming each number, or move to a shared
cache-policy constants module if other routes will share the profile.
(Related to [api § cdn-cache](./api.md#cdn-cachets-used-by-exactly-one-handler)
— there is already a CDN-cache utility; a consolidation pass could unify
both.)

---

## Finding count summary

- Redundant: 4 (auth re-exports, provider checks, CORS header, Vercel flag) +
  doc loader 404
- Over-engineered: 3 (cookie prefix, parseBootstrapPointer, manifest cache
  constants)
- Smelly: 6 (startup double-state, session callback overload, OIDC log flag,
  layout email strip, guard predicate, session-fetch style)

Total: 13 themes; ~18 concrete locations.
