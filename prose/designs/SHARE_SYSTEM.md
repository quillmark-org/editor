# Share System Design

**Status**: Implemented
**Related**: [OVERLAY_SYSTEM.md](OVERLAY_SYSTEM.md), [STATE_PATTERNS.md](STATE_PATTERNS.md), [SERVICE_FRAMEWORK.md](SERVICE_FRAMEWORK.md)

## Overview

Public document sharing via UUID-based URLs. Authors toggle "General Access" to make documents publicly viewable. Viewers can create personal copies ("fork") of shared documents.

## Design Principles

### URL Stability

Public URLs use the document's existing UUID (`/doc/:uuid`). URL never changes, even if document is renamed. Aligns with planned ACL system attached to UUID.

### Security Through Obscurity

UUIDs provide 122 bits of entropy. Combined with the `is_public` flag, guessing valid document IDs is infeasible.

### Error Ambiguity

404 responses do not distinguish between "document doesn't exist" and "document is private" to prevent UUID enumeration attacks.

---

## Database Schema

### Documents Table Extension

Single boolean field addition:

| Field       | Type    | Default | Description                             |
| ----------- | ------- | ------- | --------------------------------------- |
| `is_public` | BOOLEAN | FALSE   | Whether document is publicly accessible |

**Migration**:

```sql
ALTER TABLE documents ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE;
```

**Index** (optional, for listing public docs later):

```sql
CREATE INDEX idx_documents_is_public ON documents(is_public) WHERE is_public = TRUE;
```

---

## Type Extensions

### Document Interface

Extend `Document` and `DocumentMetadata` in `$lib/services/documents/types.ts`:

```ts
export interface Document {
	// ... existing fields
	is_public: boolean;
}

export interface DocumentMetadata {
	// ... existing fields
	is_public: boolean;
}
```

### Public Document Response

New type for public document fetches (excludes owner-sensitive fields):

```ts
export interface PublicDocument {
	id: UUID;
	name: string;
	content: string;
	owner_display_name: string; // "nibs" or "Anonymous"
}
```

---

## API Endpoints

### Toggle Public Access

**Endpoint**: `PATCH /api/documents/[id]`

Uses existing update endpoint with `is_public` field:

```ts
// Request
{
	is_public: true;
}

// Response: Updated DocumentMetadata
```

**Authorization**: Owner only (existing `requireAuth` + ownership check)

### Fetch Public Document

**Endpoint**: `GET /api/public/documents/[id]`

No authentication required. Returns `PublicDocument` if `is_public` is true.

**Responses**:

- `200`: Document content
- `404`: Document not found OR not public (ambiguous by design)

---

## UI Components

### Publish Modal

**Component**: `$lib/components/PublishModal.svelte`

Uses `base-dialog.svelte` with `size="sm"` (compact modal). Follows [OVERLAY_SYSTEM.md](OVERLAY_SYSTEM.md) Dialog pattern.

**Layout** (top to bottom):

```
┌─────────────────────────────────────┐
│  Share Document               [×]   │  ← Header with close button
├─────────────────────────────────────┤
│                                     │
│  General Access                     │
│  ┌──────────────────────────────┐   │
│  │ ○ Off   ● Anyone with link  │   │  ← Toggle control
│  └──────────────────────────────┘   │
│                                     │
│  ┌──────────────────────────────┐   │
│  │ https://app.com/doc/abc...  │ 📋 │  ← Link + copy button
│  └──────────────────────────────┘   │
│  (disabled when toggle is Off)      │
│                                     │
└─────────────────────────────────────┘
```

**Visual States**:

| State   | Toggle     | Link Field                            | Copy Button |
| ------- | ---------- | ------------------------------------- | ----------- |
| Private | Off (left) | `text-muted-foreground`, `opacity-50` | Disabled    |
| Public  | On (right) | `text-foreground`, full opacity       | Enabled     |

**Behavior**:

1. Toggle triggers immediate `PATCH` to update `is_public`
2. Optimistic UI update with error rollback
3. Success toast: "Document is now public" / "Document is now private"
4. Copy button uses Clipboard API with success toast

---

## Public Viewer (Consumer Experience)

### Route

**Path**: `/doc/[id]` (same as editor, different mode)

### Access Logic

```ts
// +page.server.ts
const doc = await fetchPublicDocument(params.id);

if (!doc) {
	// Document doesn't exist OR is_public is false
	throw error(404, 'Document not found');
}

return { publicDoc: doc };
```

### Teaser Mode UI

**Visual Treatment**:

- Editor content rendered at `opacity-70` ("dimmed")
- Non-interactive (no cursor changes, no selection)
- Scroll enabled for reading

**Toolbar Replacement**:

Standard formatting toolbar replaced with:

```
┌─────────────────────────────────────────────────┐
│  📄 Shared by [owner_name]      [ Create Copy ] │
└─────────────────────────────────────────────────┘
```

**Elements**:

- Attribution: `text-muted-foreground`, `text-sm`
- "Create Copy" button: Primary style (`bg-primary text-primary-foreground`)

### Fork Workflow

**"Create Copy" Click**:

1. **If logged in**:
   - Open `NewDocumentModal` pre-filled with:
     - Name: `"{original_name} (Copy)"`
     - Content: Original document content
   - On create: Navigate to new document in edit mode

2. **If not logged in**:
   - Store document in `sessionStorage` as "pending fork"
   - Redirect to login
   - After login callback, check for pending fork and resume

**Unique Name Generation**:

Reuse `NewDocumentModal` pattern:

```ts
function generateForkName(originalName: string, existingNames: string[]): string {
	const baseName = `${originalName} (Copy)`;
	if (!existingNames.includes(baseName)) return baseName;

	let counter = 2;
	while (existingNames.includes(`${originalName} (Copy ${counter})`)) {
		counter++;
	}
	return `${originalName} (Copy ${counter})`;
}
```

---

## Error States

### 404 Page

**Route**: `/doc/[id]` when document not found or private

**UI**:

```
┌─────────────────────────────────────┐
│                                     │
│         📄                          │
│                                     │
│   Document not found                │
│                                     │
│   This document may have been       │
│   deleted or made private.          │
│                                     │
│        [ Go to Editor ]             │
│                                     │
└─────────────────────────────────────┘
```

**Styling**:

- Container: Centered, `max-w-md`
- Icon: `text-muted-foreground`, `w-16 h-16`
- Title: `text-xl font-semibold`
- Description: `text-muted-foreground`
- Button: Secondary style

---

## State Management

### Document Store Extension

Add `is_public` to document state and methods:

```ts
// documents.svelte.ts
async setPublic(id: UUID, isPublic: boolean): Promise<void> {
  // Optimistic update
  const doc = this.documents.get(id);
  if (doc) doc.is_public = isPublic;

  try {
    await this.client.updateDocument(id, { is_public: isPublic });
  } catch (error) {
    // Rollback
    if (doc) doc.is_public = !isPublic;
    throw error;
  }
}
```

### Guest Mode

Guest users (localStorage storage) cannot share documents publicly:

- Share button disabled in TopMenu
- PublishModal shows message: "Sign in to share documents publicly"

---

## Cross-References

- **Overlay patterns**: [OVERLAY_SYSTEM.md](OVERLAY_SYSTEM.md) - Dialog component usage
- **State management**: [STATE_PATTERNS.md](STATE_PATTERNS.md) - Optimistic updates
- **Service patterns**: [SERVICE_FRAMEWORK.md](SERVICE_FRAMEWORK.md) - API integration
- **Design tokens**: [DESIGN_TOKENS.md](DESIGN_TOKENS.md) - Colors, spacing
- **Accessibility**: [ACCESSIBILITY.md](ACCESSIBILITY.md) - WCAG compliance
