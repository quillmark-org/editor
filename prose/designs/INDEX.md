# Architecture & Design Documentation

**Purpose**: Design documents describing Tonguetoquill's architectural patterns and desired state.

## Quick Navigation

### Canonical Design Docs (grouped)

**Architecture & Services**
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - App structure, routing, component organization
- **[SERVICE_FRAMEWORK.md](SERVICE_FRAMEWORK.md)** - Client/server service patterns, API integration
- **[STATE_PATTERNS.md](STATE_PATTERNS.md)** - Store factories, auto-save, guest mode
- **[AUTHENTICATION.md](AUTHENTICATION.md)** - OAuth flow and authentication patterns
- **[ERROR_SYSTEM.md](ERROR_SYSTEM.md)** - Error handling across all layers
- **[METRICS.md](METRICS.md)** - Usage metrics: existing tables + document_export_counts + user_activity, Grafana

**UI Foundations**
- **[DESIGN_TOKENS.md](DESIGN_TOKENS.md)** - Tokens for colors, spacing, typography, z-index
- **[ACCESSIBILITY.md](ACCESSIBILITY.md)** - WCAG 2.1 AA standards
- **[OVERLAY_SYSTEM.md](OVERLAY_SYSTEM.md)** - Dialog/Popover/Sheet/Toast/Select patterns

**Editing Experience**
- **[VISUAL_EDITOR.md](VISUAL_EDITOR.md)** - ProseMirror-based WYSIWYG editor
- **[MD_PLACEHOLDERS.md](MD_PLACEHOLDERS.md)** - Body placeholders, YAML `!fill`, deferred fill navigation (high level)
- **[HOTKEYS.md](HOTKEYS.md)** - Keyboard shortcuts across editors and modals

**Metadata & Wizards**
- **[WIZARD_SYSTEM.md](WIZARD_SYSTEM.md)** - Schema-driven metadata editing
- **[WIZARD_DIRTY_TRACKING.md](WIZARD_DIRTY_TRACKING.md)** - Selective YAML updates and dirty tracking

**Document Lifecycle**
- **[DOCUMENT_SOURCES.md](DOCUMENT_SOURCES.md)** - Multi-source sidebar (cloud + local)
- **[SHARE_SYSTEM.md](SHARE_SYSTEM.md)** - Public sharing via UUID links
- **[TEMPLATE_LIBRARY.md](TEMPLATE_LIBRARY.md)** - Community template browse/publish/import model

**Maintenance**
- **[sweep_report.md](sweep_report.md)** - Notes from periodic consistency sweeps

---

## Canonical Summaries

### Architecture & Services
- **ARCHITECTURE.md**: SvelteKit 5 app structure, feature-based components, SSR, guest/auth flows, responsive patterns.
- **SERVICE_FRAMEWORK.md**: Client singletons and server factories, initialization/ready checks, API integration, retries.
- **STATE_PATTERNS.md**: Store factories, debounced autosave, guest vs auth storage split, Svelte 5 runes usage.
- **AUTHENTICATION.md**: OAuth flow, session refresh, guest fallback, provider abstraction.
- **ERROR_SYSTEM.md**: AppError base, typed codes, diagnostics, consistent UI handling.
- **METRICS.md**: Lean on `documents` table for creation counts; `document_export_counts` and `user_activity` tables for gaps; Grafana PostgreSQL data source; DAU/WAU queries.

### UI Foundations
- **DESIGN_TOKENS.md**: CSS custom properties, Tailwind integration, light/dark variants, z-index, typography/spacing.
- **ACCESSIBILITY.md**: WCAG 2.1 AA, keyboard and focus management, screen reader support, high contrast.
- **OVERLAY_SYSTEM.md**: Dialog/Popover/Sheet/Toast/Select patterns, composable hooks, responsive behavior.

### Editing Experience
- **VISUAL_EDITOR.md**: ProseMirror WYSIWYG, markdown round-trip, MetadataWidget, mode switching, input rules.
- **MD_PLACEHOLDERS.md**: `{:...:}` body placeholders, YAML `!fill` at a glance, deferred unified navigation—concise; code owns specifics.
- **HOTKEYS.md**: Modal/editor/array shortcuts, CodeMirror keymap integration.

### Metadata & Wizards
- **WIZARD_SYSTEM.md**: Schema-driven wizard (modal + VisualEditor embedded), component hierarchy, data flow.
- **WIZARD_DIRTY_TRACKING.md**: Dirty Set, selective YAML merge, empty-field rules.

### Document Lifecycle
- **DOCUMENT_SOURCES.md**: Cloud + local sources, grouping rules, collapse persistence, per-doc promotion.
- **SHARE_SYSTEM.md**: UUID links, general access toggle, teaser mode, fork flow, OG metadata.
- **TEMPLATE_LIBRARY.md**: Template publishing lifecycle, library browse UX, star/import behavior, document-template linkage.

### Maintenance
- **sweep_report.md**: Consistency sweep notes and deltas.

---

## Component & Service Documentation

**Component READMEs**:

```
src/lib/components/
└── (none currently)
```

**Reference Documentation** (`prose/reference/`):

```
prose/reference/
├── API.md                    # Complete API endpoint reference
└── EXTENDED_MARKDOWN.md      # Quillmark metadata syntax specification
```

**Service READMEs**:

```
src/lib/services/
├── quillmark/README.md
└── templates/README.md
```

**Error System Documentation**:

```
src/lib/errors/README.md
```

---

## Maintenance

- **One Canonical Source Per Topic**: Consolidate overlapping docs; delete obsolete docs; fix broken links.
- **Keep Skimmable**: Examples over prose. Bullets over paragraphs. Code samples brief.

---

## Consistency Sweeps

| Date | Changes |
|------|---------|
| 2026-04-08 | Fill field navigation removed from codebase; `FILL_NAVIGATION.md` replaced with a deferred stub; cross-links updated in design docs (`WIZARD_SYSTEM`, `VISUAL_EDITOR`, `STATE_PATTERNS`, `ARCHITECTURE`, `HOTKEYS`, `MD_PLACEHOLDERS`, `OVERLAY_SYSTEM`, `MARKDOWN_FORM_FIELD` proposal). |
| 2026-04-09 | Consolidated `FILL_NAVIGATION.md` into `MD_PLACEHOLDERS.md` as one high-level doc; deleted `FILL_NAVIGATION.md`. |
| 2026-03-26 | Design sweep: updated `ARCHITECTURE.md` component + API route inventory for current template-library implementation (`NewDocumentModal`, `TemplatePublishModal`, `/api/templates/*` endpoints). Added new canonical `TEMPLATE_LIBRARY.md` high-level design doc and linked from index. |
| 2026-03-20 | Deleted `DB_SECURITY_DB10.md` (plan doc, work implemented). `ARCHITECTURE.md`: `LoginToPublishModal` → `FeatureLoginModal`; added `classification-banner.svelte` and `inline-editable-title.svelte` to ui/ listing. `STATE_PATTERNS.md`: removed stale plan-name status line. `SHARE_SYSTEM.md`: status Draft → Implemented; removed scratchpaper ref. `INDEX.md`: `document_exports` → `document_export_counts` in METRICS summary. |
| 2026-01-20 | Removed obsolete PROSEMIRROR_AUDIT reference, updated DOCUMENT_SOURCES.md for implemented multi-source sidebar, refreshed ARCHITECTURE.md component list, aligned WIZARD_SYSTEM.md naming with VisualEditor |
| 2026-01-04 | Updated VISUAL_EDITOR.md (RichTextEditor→VisualEditor, PlaceholderNodeView→BodyEditor, component table), Updated MD_PLACEHOLDERS.md (Floating Form→Select-to-Replace), Created sweep_report.md |
| 2025-12-27 | Created API.md (comprehensive API endpoint reference), Updated README.md (Drizzle ORM with multiple drivers, Auth.js providers), Updated ARCHITECTURE.md (Auth.js, Drizzle ORM), Updated SERVICE_FRAMEWORK.md (Drizzle patterns instead of Supabase), Fixed EXTENDED_MARKDOWN.md (thematic breaks contradiction) |
| 2025-12-26 | Updated ARCHITECTURE.md (component names: ShareModal→PublishModal, added KeyboardShortcutsModal, updated ui/ components), AUTHENTICATION.md (rewrote for Auth.js implementation), SHARE_SYSTEM.md (component name fix) |
