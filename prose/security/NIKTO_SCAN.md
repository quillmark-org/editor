# Nikto Scan Report

**Target:** `http://localhost:4173` (preview build)
**Tool:** Nikto 2.1.5 — 6544 checks, 27s, 15 items reported
**Date:** 2026-04-21

Nikto is a signature scanner; it does not exercise authenticated API surface. Cross-reference with `API_VULNS.md` for application-layer findings.

---

## Real findings

### [medium] Missing clickjacking defence on HTML responses

- `GET /` ships no `X-Frame-Options` header.
- The `content-security-policy: default-src 'none'` header is present **only on `OPTIONS *`** responses — HTML GETs have no CSP, and in particular no `frame-ancestors`.
- Result: the app can be framed by any origin.
- **Fix:** in `hooks.server.ts`, set `X-Frame-Options: DENY` (or add `frame-ancestors 'none'` to a CSP that is applied to HTML GET responses, not just OPTIONS).

### [low] `Access-Control-Allow-Origin: *` on `GET /`

- The SSR HTML route advertises a wildcard origin. Browsers refuse `*` + credentials, so this is not directly exploitable, but it is surprising on an authenticated-app root.
- **Fix:** audit every response path that sets `Access-Control-Allow-Origin` and confirm none pair `*` with `Access-Control-Allow-Credentials: true`. Prefer narrowing to known origins or omitting CORS on SSR HTML entirely.

### [info] `OPTIONS /` advertises write methods

- `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE` is the SvelteKit preflight default. Not a vulnerability; flagged only for visibility.

### [info] `robots.txt` has empty `Disallow`

- Intentional per the file's own comment ("allow crawling everything by default"). Not a security issue.

---

## False positives (verified, do not act on)

All three signature-based "files found" hits return **HTTP 404** — Nikto matches on SvelteKit's error page body, not status.

| Nikto claim | Verified status |
| --- | --- |
| `/WEB-INF/web.xml: JRUN default file found` | 404 |
| `OSVDB-17664 /_mem_bin/remind.asp: password reminder` | 404 |
| `OSVDB-4231 /5LpQ6.xml: Cocoon path disclosure` | 404 |
| `Server leaks inodes via ETags (0xuyufqi)` | ETag is a short SvelteKit content hash, not a Unix inode |
| `Cookie auth-972e5595.callback-url created without httponly flag` | Cookie actually sent with `HttpOnly; Secure; SameSite=Lax` (verified via `curl -I`); Nikto parser artefact |
| Uncommon headers `x-sveltekit-page`, `x-sveltekit-normalize`, `link`, `content-security-policy` | Normal framework behaviour; CSP is a positive signal |

---

## Coverage gap

Nikto validates generic HTTP posture only. It does **not** cover:

- Authenticated API routes (`/api/**`) — see `API_VULNS.md`.
- Authz / IDOR — see `API_VULNS.md`.
- SSRF, rate-limiting, logic flaws — see `API_VULNS.md`.

## Recommended next step

One action closes the one real finding:

- Add `X-Frame-Options: DENY` to all HTML responses from `src/hooks.server.ts`, or extend the existing CSP to include `frame-ancestors 'none'` on HTML GETs.
