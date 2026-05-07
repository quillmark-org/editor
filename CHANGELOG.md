# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.1.2]

### Added

- Add 'none' option to endorsement action dropdown menus

### Changed

- Replace Cinzel with Copperplate CC font for USAF memo letterhead
- Default endorsement date to today when omitted

### Fixed

- Remove spacing gaps in endorsement body paragraphs
- Prevent page scroll to top when expanding collapsible groups in the schema form

## [v0.1.1]

### Added

- Native date picker complement to DateField with full surface clickability and direct text input.

### Changed

- Update @airmark/quiver to v0.8.0 with USAF Memo template enhancements:
  - Classification dropdown (UNCLASSIFIED, CUI, CONFIDENTIAL, SECRET, TOP SECRET) to prevent unsupported markings.
  - DoD/CAPCO-aligned banner colors by classification level.
  - Optional dissemination control marking field appended after classification banner.
  - Fixed signature block hanging indent to AFH 33-337 compliance (0.5em).
  - Auto-shift long names/titles to left margin to prevent overflow.
  - Consistent blank-line spacing and restored subject/body gap.
  - Support for decimal font sizes in Quill.yaml.
  - Removed `auto_numbering` parameter and top-level `BODY` field.
- BooleanField layout refactored to horizontal grid for consistency with other Wizard fields.

### Fixed

- Empty USAF Memo body content now collapses cleanly without ghost paragraphs.
- Indorsement action-line spacing corrected to symmetric 1 line above/below.
- Chevron spacing tightened in MetadataWidget section headers.
- Indorsement date field no longer inserts today's date when left blank.
- VisualEditor hardened against silent corruption paths.
- DateField picker open/close lifecycle restored to native behavior.

## [v0.1.0]

### Added

- Render template thumbnails off-main-thread via dedicated Web Worker for improved main-thread responsiveness during WASM rendering.
- Pre-warm Web Worker and template thumbnail cache at app load, so the New Document modal paints from cache on first open instead of running ~25 serialized renders.

### Changed

- Migrate editor to @quillmark/wasm Document model.
- Upgrade @quillmark/wasm to version 0.65.1; adjust thumbnail rendering and page indexing to 0-indexed per updated RenderOptions.
- Upgrade @quillmark/quiver to version 0.5.1.
- Update uuid to version 14.0.0.
- Refactor overlay store to prevent re-run loop during overlay closure.

### Fixed

- Remove redundant prefetch call in NewDocumentModal; template list is now fully covered by post-fetch effects.
- Prevent empty-state flash during initial template gallery load by rendering nothing in the detail pane until templates are selected and loaded.
- Clean up post-migration legacy following @quillmark/wasm 0.64 bump.

## [v0.0.20]

### Fixed

- Include CHANGELOG.md in Docker build context to resolve asset imports during production builds.

## [v0.0.19]

### Added

- In-app "What's new" sheet surfacing release notes to users through the account menu, with a passive indicator that clears on open.
- Backfill template recent imports from the event log so users see their prior template usage in NewDocumentModal.

### Changed

- Consolidate template creation onto `/api/templates/[id]/import` endpoint; remove `source_template_id` from document creation path to ensure authoritative event and recents tracking.
- Raise `/api/templates` default page size from 25 to 100 to match gallery behavior and surface full Popular section in NewDocumentModal.
- Simplify production deployment config: materialize app environment variables via docker-compose interpolation instead of .env.dod sideload; always force-recreate containers; remove conditional db-image detection.
- Cache JWT user-existence check on token to eliminate per-request database hit in auth middleware.

### Fixed

- Restore `base-sheet` primitive for WhatsNewSheet side-drawer (with mobile bottom-sheet fallback); component had been incorrectly deleted despite active usage.
- Guard production deploys against port 5432 conflicts from stale containers; fail loudly if the port is held by another project.
- Widen UUID validation back to v4+v5 after overly-strict v4-only regression broke official template id acceptance.

### Security

- Extract and consolidate cron route authentication into single `requireCronAuth()` helper with centralized timing-safe bearer-token validation.

## [v0.0.18]

### Added

- Support for listing recent templates with O(limit) read performance via new `template_user_recents` read-model, upserted on each import.
- New `DocumentListItem` projection to cleanly separate document and template domains, carrying template publication status without coupling visibility systems.

### Changed

- Reorganize `Document` write model to remove template awareness; `is_template` flag now computed only in list-row projection.
- Rename `/api/cron/repair-templates-by-document` to `/api/cron/repair-template` and simplify response to flat booleans plus `found` flag.
- Restrict CORS `Access-Control-Allow-Methods` header to advertised methods only (GET, HEAD, OPTIONS, POST, PUT, DELETE).
- Reorder TopMenu to swap Keyboard Shortcuts and Document Stats positions.
- Increase NewDocumentModal popular templates cap from default to 100.
- Enhance focus-trap utility to prevent scrolling when restoring focus.
- Improve NewDocumentModal scroll behavior: snap selected template into view on arrow-key navigation, restore home gallery scroll when clearing filters.

### Fixed

- Resolve O(n) query amplification in `GET /api/templates/recents` via unbounded dedup scan and `COUNT(DISTINCT)`.
- Fix effect update depth loop in VisualEditor during document initialization by narrowing `untrack()` scope.
- Correct gallery scroll position reset when applying new filters in NewDocumentModal.

### Security

- Mitigate HIGH-severity SSRF vulnerability in `GET /api/cron/seed-templates` by replacing `getSiteURL()` with `config.urls.production`, preventing attacker-controlled Vercel preview URLs.
- Add `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` to all responses to prevent clickjacking attacks.
- Tighten open-redirect validation in `hooks.server.ts` on `callbackUrl`.
- Strip `user.email` from session payload before client-side exposure (PII leak mitigation).
- Escape markdown-sensitive characters in feedback title and description.
- Restrict feedback GitLab URL to allowlisted production host over HTTPS.
- Reject private source documents in template creation.
- Add `ownerId` predicate to template unpublish cascade DELETE.
- Tighten template content fork-document fetch authorization.
- Validate `x-correlation-id` header against allowlist regex; fall back to `crypto.randomUUID()`.
- Remove `DISABLE_CSRF_CHECK` environment escape hatch; restrict CSRF disablement to `NODE_ENV=development` only.
- Strengthen template-filename allowlist validation with regex guard against URL-encoding bypasses.

## [v0.0.17]

### Added

- Mark-template-official job in utils workflow to officially mark templates via HTTP cron route, with validation for template ID as a valid UUID.

### Changed

- Rename document info UI to document stats.
- Simplify service worker by removing offline fallback response and streamlining installation to focus on immediate activation.
- Enhance browser context checks in export actions and template API calls to prevent server-side execution and improve error handling.

### Removed

- Ephemeral document system and unauthenticated document persistence paths.

## [v0.0.16]

### Added

- Add `loading` prop to Button component with integrated spinner, reducing boilerplate across submit-button call sites.
- Support for `FEEDBACK_GITLAB_URL` and `FEEDBACK_GITLAB_KEY` environment variables for production feedback integration.

### Changed

- Refactor TopMenu into three focused subcomponents (DocumentActions, AccountMenu, TitleBar) that read from stores directly, reducing prop sprawl from 15 to a composition API.
- Collapse DocumentEditor modal state from four boolean flags into a single union type (`'info' | 'import' | 'publish' | 'share' | null`), reducing state field count.
- Extract ResizableSplit helper class to isolate resize-pane logic and pointer event handling, reducing DocumentEditor state fields by 7.
- Parallelize template repair loop with concurrency cap (8 workers) and best-effort error semantics per row.
- Merge template list and count queries into a single SQL query using `COUNT(*) OVER()` window function, halving database round-trips.
- Type-augment MarkdownSerializerState to remove unsafe casts in serializer logic.

### Fixed

- Initialize feedback API issue variable to null, fixing TypeScript control-flow analysis error.
- Remove debug console.log from BodyEditor unhandled-format branch.
- Restore loading label swaps (e.g. "Publish" → "Publishing...") in migrated submit-button call sites for visual and assistive-tech feedback.
- Use static rulerStore import in DocumentActions to match original pattern and avoid unnecessary dynamic imports.
- Guard YAML round-trip against parse errors; return unchanged source on malformed input instead of crashing the editor.
- Fix duplicate CARD field when adding new cards by allowing optional quotes in CARD_PATTERN regex match.
- Prevent loss of repair rows on escaped exceptions by requiring onTaskError fallback that synthesizes error rows.

### Removed

- Remove unused deprecated iconMap alias.
- Remove early abstractions (date helper, fetch wrapper, form-state rune) with only 2 call sites each.

## [v0.0.15]

### Added

- Dual-provider feedback issue routing supporting both GitHub and GitLab with `FEEDBACK_*` credentials.
- GitLab feedback configuration validation to ensure proper setup before submission.

### Changed

- Refine feedback provider typing and branch handling for GitLab token resolution.
- Update feedback submission logic to account for GitLab configuration and dynamically resolve issues post URL.

### Fixed

- Remove unreachable feedback provider fallback branch.

## [v0.0.14]

### Changed

- Enforce string scalar safety in YAML processing by explicitly quoting all string values, improving consistency and preventing potential parsing issues.
- Update `@tonguetoquill/collection` to 0.17.4 and `@quillmark/wasm` to 0.55.0.
- Repair legacy YAML merge strategy.

### Fixed

- Improve tag detection in release workflow to correctly identify the last strict semver patch release tag while ignoring tags with letter suffixes.

## [v0.0.13]

### Added

- Integrate registry font cache with enhanced quill packaging and logging for font dehydration details.
- In-app beta feedback modal for collecting bug and feature reports with auto-captured browser, OS, route, and session metadata; posts to `/api/feedback` with GitHub issue creation and per-user rate limiting.
- Promote ruler tool and keyboard shortcuts to standalone icon buttons in the top menu.
- Add tooltips to top menu elements including document rename.
- Template repair functionality via authenticated HTTP cron endpoint, replacing document/template migration semantics.

### Changed

- Update CI workflow tags from [BXCR, IL2, Rocky, Application, NODE14, redis] to [Airmark, IL2, Rocky, Proxmox] for improved infrastructure alignment.
- Bump `@quillmark/registry` from 0.16.0 to 0.17.0.
- Conditionally render top menu footer divider in meatball menu based on Beta Program or Feedback entry availability.
- Cap home recents section in NewDocumentModal to five templates in a single row; remove recents scope from gallery filter logic.
- Update download button to info color scheme and publish button to filled success style.
- Simplify beta feedback form to use consistent (Type + Title + Description) fields across Bug, Feature request, and UX issue types.
- Adjust template repair to use `template_id` as preferred parameter with backward compatibility for `document_id`.
- Change template repair default behavior from dry-run to live execution.

### Fixed

- Address beta feedback backend review comments and improve validation.
- Correct indentation in unpublish-template job tags in GitLab CI workflow.

### Removed

- Feedback submission rate limiting table, migration file, and related database schema.
- Rate limiting logic from feedback submission API.
- Recents scope from NewDocumentModal gallery filter.
- 'ux' feedback type in favor of unified Bug and Feature request types.
- Old migration script and esbuild dependency from build process.
- Outdated document migration tests.

## [v0.0.12]

### Added

- Strip markdown HTML comments from both markdown and visual editor pipelines to prevent comment artifacts in processed documents.
- Enhance document migration tests to preserve formatting, including newlines, blank lines, and CRLF styles after frontmatter fences.

### Changed

- Improve quill manifest loading mechanism by replacing static directory path resolution with dynamic imports, enhancing compatibility with server bundles.
- Update quills static directory path resolution to use `process.cwd()` for better compatibility in server environments.
- Refactor YAML handling in document migrations with new utility functions (`replaceDelimitedYamlRange`, `prependDelimitedYamlBlock`, `getTrailingLineBreak`) for streamlined and more maintainable block processing.
- Upgrade @quillmark/registry to version 0.16.0 and refactor related imports.
- Remove unused spec cache and related methods in QuillmarkServerService.
- Simplify quills static asset caching by relying on default CDN and browser caching rules instead of custom Cache-Control headers.

## [v0.0.11]

### Added

- Show total category counts on new document "see all" links.
- Resizable editor/preview split panels with draggable divider; users can adjust the split ratio (30–70%) by pointer drag or arrow keys.
- Enhanced template filtering in NewDocumentModal with options for 'official', 'popular', and 'search' categories.
- Schema-driven date field formatting via `x-ui.dateFormat` property and column span layout via `x-ui.colSpan`.

### Changed

- Cap home sections at 10 items; introduce `RECENTS_MAX_ITEMS` limit for recent templates in NewDocumentModal.
- Migrate web schema consumers to @quillmark/wasm 0.54 Quill YAML contract; datetime schema fields now render as text inputs.
- Refactor DateField component to simplify date handling and validate ISO format directly.
- Upgrade @quillmark/wasm to 0.54.1, @quillmark/registry to 0.13.0, and @tonguetoquill/collection to 0.16.1.

### Fixed

- Resolve mouse state and resizer state desync when hovering the edge of the resizable panel hitbox.
- Fix stale card type in VisualEditor.
- Correct NewDocumentModal recents count logic to respect the maximum items limit.

## [v0.10.0]

### Added

- Support for environment variable overrides (`QUILL_SRC_DIR` and `TEMPLATE_SRC_DIR`) to enable local collection iteration during development.
- Append-only event log for document export analytics (`document_export_events`) with user, document, and timestamp indexing.

### Changed

- Update @quillmark/wasm to 0.53.1 and @tonguetoquill/collection to 0.15.0 for compatibility and UI schema updates.
- Refactor TemplateCard layout and styling with improved grid alignment, responsive thumbnail sizing, and badge positioning.
- Enhance TemplateCard hover effects and focus handling with scaled interactions and reduced-motion accessibility support.
- Replace pre-aggregated document export counts with append-only event log as the authoritative export analytics source.

## [v0.0.9]

### Added

- Auto-star templates when publishing.
- Non-blocking PR test workflow.

### Fixed

- Resolve NewDocumentModal template cache freshness after publish by increasing cache TTL to 60 seconds.

### Removed

- Remove placeholder navigation system from VisualEditor, including metadata parsing, ProseMirror placeholder parsing, and Fill Field Navigation components.

### Security

- Enhance production release notes with ISSM approval instructions.

## [v0.0.8]

### Added

- Auto-star templates when publishing.
- Non-blocking PR test workflow.

### Fixed

- Resolve NewDocumentModal template cache staleness after publish by increasing cache TTL to 60 seconds.
- Remove placeholder navigation system from VisualEditor and consolidate placeholder logic into documentation.

## [v0.0.7]

### Changed

- Hide metadata widget in VisualEditor when schema has no renderable form fields.
- Adjust line spacing in ProseMirror editor: single-line spacing for lists and 1.5x line height for paragraphs.

## [v0.0.6]

### Added

- Honor `x-ui.multiline` across SchemaForm text and markdown fields with auto-growing 3-line editors.
- Preserve full USAF OIDC claims in `users.profile` JSONB to retain provider data (Rank, PDN, OrgCode, DutyOrgCode, UnitIdentificationCode, etc.) without schema migrations.

### Changed

- Update @sveltejs/kit to 2.56.1 and drizzle-kit to 0.31.10.
- Update @quillmark/wasm to 0.51.1 and @tonguetoquill/collections to 0.13.5.
- Fix markdown line break rendering
- New template: `daf1206`

### Fixed

- Unify Vercel detection to correctly disable Vercel Speed Insights.
- Svelte 5 bind pattern bug

## [v0.0.5]

### Fixed

- Unify Vercel detection to correctly disable Vercel Speed Insights.

## [v0.0.4]

### Added

- Changelog validation script and CI workflow for release pull requests.
- Automated release workflow via GitHub Actions that bumps version, generates changelog, and opens pull request.

### Changed

- Reorganize DocumentList sections into data-driven loop with unified collapsible behavior.
- Rename "Your Templates" section to "Templates" and reorder sections (Templates at top, followed by Your Docs, then On Device).
- Update document auto-select fallback logic: last opened → first Your Docs item → first local item → empty.
- Use GitHub Actions release workflow with `GH_PAT` token fallback to `GITHUB_TOKEN` for pull request creation.

### Fixed

- Fix `execSync` error in release process.
- Resolve changelog generation to include full commit bodies and footers (e.g., BREAKING CHANGE).

## [v0.0.3]

### Changed

- Disabled DAF Form 1206 (Nomination for Award) and enabled DAF Form 4392 (Pre-Departure Safety Briefing) in the document collection.

## [v0.0.2]

### Added

Initial release.
