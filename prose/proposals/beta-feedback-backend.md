# Beta Tester Feedback — Backend

## API

- **Method/route**: `POST /api/feedback`
- **Auth**: Require existing logged-in app session. Unauthenticated request returns `401`.
- **Content-Type**: `application/json` only for v1.
- **Body** (v1 contract):
  - **`type`**: required enum `bug` | `feature-request` | `ux-issue`.
  - **`title`**: required string, trimmed, 3-120 chars.
  - **`description`**: required string, trimmed, 10-5000 chars.
  - **`environment`**: optional object from client with keys:
    - `browser` (string, max 120)
    - `os` (string, max 120)
    - `route` (string, max 300)
    - `screen` (string, max 120)
- **Reporter identity**: server derives `reporterName` and `reporterEmail` from session/user record (do not trust client for these).
- **Screenshot**: explicitly out of scope for v1.
- **Severity**: not in payload for v1.

**Validation behavior**

- Return field-level validation errors for bad enums/lengths/types.
- Normalize strings by trimming before validation.
- Ignore unknown top-level fields (do not fail request); only documented fields are validated and used for issue creation.
- Require `reporterEmail` in session/user record; if missing, fail request with `422` and do not create an issue.

**Responses**

- **`201 Created`**:
  - `{ "id": "<github issue number>", "url": "<github issue html url>" }`
- **`400 Bad Request`** (validation):
  - `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": { "<field>": "<reason>" } } }`
- **`401 Unauthorized`**:
  - `{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required." } }`
- **`422 Unprocessable Entity`** (authenticated but missing required user profile data):
  - `{ "error": { "code": "MISSING_REPORTER_EMAIL", "message": "Your account is missing an email address. Contact support." } }`
- **`502 Bad Gateway`** (GitHub failure) or **`500`** (internal):
  - `{ "error": { "code": "UPSTREAM_ERROR", "message": "Unable to submit feedback right now." } }`

## GitHub

- **Request**: `POST https://api.github.com/repos/nibsbin/airmark/issues`
- **Headers**: `Authorization: Bearer <token>` where `<token>` is the value of env `FEEDBACK_GITHUB_KEY` (fine-grained PAT with `issues: write`; store only in env/secret manager).
- **Labels**: Always `beta-feedback`. Add type label: `bug` | `feature-request` | `ux-issue`. Do not add severity labels from the API.
- **Title**: e.g. `[Beta Feedback] <user title>`
- **Body**: Markdown sections in this order:
  - Type
  - Reporter (name + email from session)
  - Description
  - Environment (include only non-empty fields from `environment`)

## Security & ops

- **Env**:
  - `FEEDBACK_GITHUB_KEY` — GitHub token used for GitHub issue creation.
  - `FEEDBACK_GITLAB_KEY` — GitLab token used for GitLab issue creation.
- Never log the raw token; rotate if leaked.

## Acceptance criteria

- [ ] Authenticated submit creates exactly one issue per request under the correct repo.
- [ ] Every issue has `beta-feedback` plus the correct type label.
- [ ] Issue body matches the agreed template (reporter + description + environment).
- [ ] Invalid payloads return `400` with field-level errors; unauthenticated is `401`; missing reporter email is `422`.
- [ ] GitHub failures return `502` (or `500` for non-upstream internal failures) without leaking secrets.
- [ ] Screenshot upload is not accepted in v1.

## Remaining awkward/open questions

- Should `description` max length stay at 5000, or be reduced for easier triage/readability in GitHub issues?
