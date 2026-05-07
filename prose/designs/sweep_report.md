# Design Consistency Sweep Report

## 2026-03-26 Sweep

### ARCHITECTURE.md

- Updated component taxonomy to match current structure:
  - `NewDocumentDialog/` → `NewDocumentModal/`
  - Added `TemplatePublishModal/`
  - Root dialog list now includes `TemplateDivergenceBanner` and removes stale `PromoteToPublishModal`.
- Added `/api/templates/*` endpoint inventory to the API route section so architecture docs reflect current template-library surface.

### INDEX.md

- Added canonical link/summary for new `TEMPLATE_LIBRARY.md`.
- Replaced stale component README pointer with `"(none currently)"` to match repository state.
- Added 2026-03-26 sweep table row.

### SHARE_SYSTEM.md

- Renamed stale references `NewDocumentDialog` → `NewDocumentModal` in fork flow UX notes.

### Added Doc

- **`TEMPLATE_LIBRARY.md`** — Minimal high-level design doc for template publishing, discovery, import, and owner maintenance workflows.

## 2026-03-20 Sweep

### Deleted Docs

- **`DB_SECURITY_DB10.md`** — Plan document describing the `document_exports` → `document_export_counts` migration and rate-limiting work. All changes described are fully implemented. Deleted: design docs must not reference plans.
- **`prose/proposals/`** (2 files) — `comment-hint-blocks.md`, `disable-guest-mode.md`. Feature proposals, not design docs; deleted entire `proposals/` directory.
- **`prose/reference/REGISTRY_MIGRATION.md`** — Migration plan for the `@quillmark/registry` integration; work is implemented. Deleted.
- **`prose/reference/REGISTRY_DESIGN.md`** — Design proposal for `@quillmark/registry` package; work is implemented. Deleted.

### ARCHITECTURE.md

- `LoginToPublishModal` → `FeatureLoginModal` (two occurrences: component list and directory tree). The actual file is `FeatureLoginModal.svelte`.
- Added `classification-banner.svelte` and `inline-editable-title.svelte` to the `ui/` directory listing — both exist in `src/lib/components/ui/` but were absent from the doc.

### STATE_PATTERNS.md

- Removed stale `Status: Canonical design for Cascade 4 implementation` line (plan reference).

### SHARE_SYSTEM.md

- Status: `Draft` → `Implemented`.
- Removed `Source` line referencing `../scratchpaper/BASIC_SHARE.md` (directory does not exist).
- Removed `BASIC_SHARE.md` reference from Out of Scope section.

### INDEX.md

- Fixed METRICS.md summary: `document_exports` → `document_export_counts`.
- Updated sweep table and `_Last Updated_` date.

---

## 2026-01-20 Sweep

- Updated navigation to drop the obsolete `PROSEMIRROR_AUDIT.md` link (file removed).
- Verified multi-source sidebar is implemented; refreshed `DOCUMENT_SOURCES.md` to describe DocumentStore + DocumentClient behavior and per-document promotion.
- Synced `ARCHITECTURE.md` component list with current directories (VisualEditor, root dialogs). _(FillFieldNavigator was later removed; see 2026-04-08 sweep in `INDEX.md`.)_
- Renamed Wizard embedded mode references to **VisualEditor** in `WIZARD_SYSTEM.md`.
