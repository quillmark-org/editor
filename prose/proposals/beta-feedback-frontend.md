# Beta Tester Feedback — Frontend

**Purpose**: In-app feedback modal triggered by the existing “Give Feedback” control. Testers never leave AirMark; no new accounts.

**Status**: Proposed  
**Related**: Backend proposal `beta-feedback-backend.md`.

---

## Problem

The feedback button goes to a Google Form. Submission volume is low, testers get no visibility into follow-up, and there is no automatic path into GitHub Issues.

## Scope

**In scope**

- Replace (or gate) the current external link with a modal opened from the same button.
- **Fields**
  - Feedback type: Bug / Feature Request / UX Issue
  - Title (single line)
  - Description (textarea)
  - Steps to reproduce (textarea) — **only when type is Bug**
  - Severity: Low / Medium / High — **only when type is Bug**
  - Screenshot — optional file upload (if backend supports it in the same milestone; otherwise hide or defer with a clear note)
- **Auto-captured on submit** (not shown in the form): browser name + version, OS, current route/screen label, tester name + email from session.
- **Submit**: `POST` to the backend feedback endpoint with JSON (and `multipart` only if we ship file upload in this slice).
- Loading, success, and error states; disable double-submit.
- Manual QA: Chrome, Firefox, Safari, Edge.
- Consistent theme  with the rest of the website/Airmark application

**Out of scope**

- Creating GitHub issues or calling GitHub from the browser (token must stay server-side).
- GitHub Discussions “bridge” UX (product/process only).

## Acceptance criteria

- [ ] Modal opens from the existing in-app feedback entry point.
- [ ] Type, title, description present; conditional steps + severity for bugs.
- [ ] Browser, OS, current screen, and session user attached on every submission payload.
- [ ] Successful submit shows clear confirmation; failures show a safe message (no token or stack traces).
- [ ] Smoke-tested on Chrome, Firefox, Safari, and Edge.

## Notes

- Keep payloads stable so the backend can map types and severities to labels without frontend knowing GitHub details.
