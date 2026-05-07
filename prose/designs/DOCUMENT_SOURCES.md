# Document Sources & Grouped Sidebar

**Purpose**: Design pattern for displaying documents from multiple sources in the sidebar. Authenticated users can access both cloud documents and local guest documents.

**Status**: Implemented
**Related**: [ARCHITECTURE.md](ARCHITECTURE.md), [STATE_PATTERNS.md](STATE_PATTERNS.md), `src/lib/components/Sidebar/`

---

## Current Behavior

- **DocumentStore** maintains two collections: `cloudDocuments` (API-backed) and `localDocuments` (localStorage).
- **DocumentClient** delegates to `APIDocumentService` for authenticated users and `DocumentBrowserStorage` for guests.
- Authenticated users can access both cloud documents and any existing local guest documents in the same session.
- The Sidebar surfaces group headers only when both sources exist (`shouldShowGroups`).
- Collapse state is persisted per group via `tonguetoquill_group_collapse_state` in localStorage.
- Local → cloud promotion is supported per-document.

---

## Document Source Model

Documents can originate from multiple **sources**:

| Source | Storage | Owner | Visibility |
|--------|---------|-------|------------|
| **My Documents** | Cloud (SvelteKit API + Drizzle) | Authenticated user | Private or public |
| **Local Documents** | localStorage | Guest/browser | Local only |
| **Shared with Me** | Cloud (future) | Other users | Read-only (future) |

## Sidebar Document Groups

The sidebar displays documents organized by source:

```
┌─────────────────────────┐
│ [+] New Document        │
├─────────────────────────┤
│ ▾ My Documents (3)      │  ← Collapsible group header
│   📄 Q4 Report          │
│   📄 Meeting Notes      │
│   📄 Draft Memo         │
│                         │
│ ▾ Local Documents (1)   │  ← Only shown if local docs exist
│   📄 My First Memo      │
│   [↑ Save to Account]   │  ← Promote action
│                         │
│ ▸ Shared with Me (0)    │  ← Future: collapsed when empty
└─────────────────────────┘
```

## Key Behaviors

**Group Visibility**:

- Guest Mode: Only "Local Documents" shown as a flat list (no header)
- Authenticated, no local docs: "My Documents" shown without group header
- Authenticated, has local docs: Both groups shown with headers (`shouldShowGroups = true`)
- Future: "Shared with Me" group when feature is implemented

**Single Header Optimization**: When only one document source exists, `shouldShowGroups = false` and headers are hidden.

**Group Collapse State**:

- Persisted to localStorage per group
- Default: all groups expanded

**Document Selection**:

- Active document can be from any group
- Selection state persists across group collapses
- Selecting a document scrolls it into view if needed

**Promote Local to Cloud** (authenticated users only):

- Per-document "Save to Account" action in the Local Documents group
- After promotion, document appears in "My Documents"
- Original local document is deleted after successful upload
- Handle name collisions with "(Copy)" suffix

---

## State Architecture

### Document Store Changes

The document store will manage multiple collections:

```
documentStore
├── cloudDocuments: DocumentMetadata[]      // User's authenticated documents
├── localDocuments: DocumentMetadata[]      // localStorage guest documents
├── sharedDocuments: DocumentMetadata[]     // Future: shared with user
├── activeDocumentId: string | null         // Can reference any source
├── activeSource: 'cloud' | 'local' | 'shared' | null
├── isLoading: boolean
├── error: string | null
└── groupCollapseState: Record<string, boolean>
```

### Derived State

```
documents                  // Combined view: cloud + local + shared
activeDocument             // Resolved from activeDocumentId + activeSource
hasLocalDocuments          // Computed: localDocuments.length > 0
shouldShowGroups           // Computed: multiple sources have documents
```

### Document Identification

Documents need source-aware identification:

- Cloud documents: UUID from database
- Local documents: `local-{timestamp}-{random}` format (existing)
- Shared documents: UUID from database (future)

The `activeSource` field disambiguates in edge cases where IDs could theoretically collide.

---

## Data Flow

### Initial Load (Authenticated User)

1. Fetch cloud documents from API
2. Read local documents from localStorage
3. Populate both collections in store
4. Auto-select most recently updated document (any source)

### Initial Load (Guest User)

1. Read local documents from localStorage
2. Populate localDocuments collection
3. cloudDocuments remains empty
4. No group headers shown

### Sign-In Transition

When guest signs in:

1. Fetch cloud documents from API
2. Keep existing localStorage documents in localDocuments
3. Show both groups with headers
4. Preserve active document selection if it's local

### Promote Document

When user promotes local document to cloud:

1. Upload document content to API
2. Handle name collision (append "(Copy)" if needed)
3. Add result to cloudDocuments
4. Remove from localDocuments
5. Update activeSource if promoted doc was active
6. Delete from localStorage

### Sign-Out Transition

When user signs out:

1. Clear cloudDocuments
2. Keep localDocuments intact
3. If active doc was cloud, select first local doc (or none)
4. Return to guest mode (no group headers)

---

## Group Component Pattern

### DocumentGroup Component

Reusable component for rendering a source group:

**Props**:

- `title`: Group display name
- `documents`: DocumentMetadata[]
- `isCollapsed`: boolean
- `onToggleCollapse`: () => void
- `activeDocumentId`: string | null
- `onSelectDocument`: (id: string) => void
- `onDeleteDocument`: (id: string) => void
- `actions`: Optional slot for group-level actions

**Behavior**:

- Renders header with collapse toggle
- Renders document list when expanded
- Handles empty state within group
- Delegates document selection/deletion to parent

### Header Design

```
┌──────────────────────────────────────┐
│ [▾] My Documents              (3)    │
└──────────────────────────────────────┘
  │                              │
  └─ Collapse toggle             └─ Document count
```

Collapsed state:

```
┌──────────────────────────────────────┐
│ [▸] My Documents              (3)    │
└──────────────────────────────────────┘
```
