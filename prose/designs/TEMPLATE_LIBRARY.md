# Template Library

## Purpose

Define the high-level model for publishing reusable document templates, browsing community templates, and importing template snapshots into new documents.

## Scope

This document covers:

- Template publishing from an owned document.
- Template discovery in the new-document flow.
- Importing a template snapshot into a newly created document.
- Ongoing linkage between a template and its source document for divergence handling.

Out of scope:

- Low-level API schemas and exhaustive endpoint contracts.
- Internal SQL/index design and migration history.
- Ranking experimentation details.

## Core Entities

- **Document**: Editable user-owned content.
- **Template**: Published snapshot + metadata derived from a document.
- **Template Snapshot**: Markdown/frontmatter/content captured at publish time.
- **Template Linkage**: Optional relationship between a published template and its source document for owner workflows.

## User Flows

1. **Browse**
   - User opens `NewDocumentModal`.
   - Client requests template list with search/sort/tag filters.
   - User selects a template and loads detail preview.

2. **Import**
   - User confirms a selected template.
   - Server creates a new document from the template snapshot.
   - New document opens in the editor as a normal document.

3. **Publish**
   - Owner opens publish/manage controls for an existing document.
   - Owner sets metadata (title/description/tags/visibility), then publishes.
   - Server stores a template record + snapshot.

4. **Maintain**
   - Owner can update metadata.
   - Owner can refresh template content from linked document.
   - Owner can reset linked document back to published snapshot.
   - Owner can unpublish template.

## Product/UX Rules (High-Level)

- Library browsing is read-heavy and optimized for quick scanning.
- Import is non-destructive: creates a new document; does not mutate the template.
- Starring is user-specific feedback and does not grant edit rights.
- Only owners can mutate template metadata/content or unpublish.
- Public browsing/visibility rules are enforced server-side.

## Template Lifecycle Contract (Publish/Unpublish + Forked Documents)

This section captures the non-obvious persistence coupling used by the current implementation.

1. **Publish creates a managed fork document**
   - Publishing from a source document snapshots content into the `templates` row.
   - The publish flow also creates a forked `documents` row owned by the publisher.
   - The template stores that fork linkage in `templates.document_id`.

2. **Template maintenance operates on the fork**
   - "Update template content" refreshes the template snapshot from the linked fork document.
   - "Reset to published" overwrites the fork document with the template snapshot.
   - This ensures maintainers can iterate on template source content in a normal document workflow.

3. **Unpublish retires both records in one transaction**
   - Unpublish marks `templates.is_published = false`.
   - The linked fork document is deleted in the same transaction when `document_id` is present.
   - This avoids leaving orphaned fork documents and keeps lifecycle semantics deterministic.

4. **Consumer imports remain independent**
   - Importing a template always creates a new consumer-owned document.
   - Imported documents are not linked back to `templates.document_id` and are unaffected by unpublish.

## Architecture Touchpoints

- **UI**
  - `NewDocumentModal` for discovery + import.
  - `TemplatePublishModal` for publish/manage workflows.
  - `TemplateDivergenceBanner` for linked-document drift controls.
- **API**
  - `/api/templates` for list + create.
  - `/api/templates/[id]` family for detail/update/delete/import/star/content/reset.
  - `/api/templates/tags` and `/api/templates/by-document/[documentId]`.
- **Services**
  - Client library client for browse/detail/import/star actions.
  - Server template library service for authorization + persistence orchestration.

## Success Criteria

- Users can reliably discover relevant templates and start from them quickly.
- Published templates remain stable snapshots for consumers.
- Owners have a clear, low-friction path to keep published templates in sync (or intentionally diverged).
