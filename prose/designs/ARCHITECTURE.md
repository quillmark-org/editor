# Frontend Architecture

## Routing Architecture

### Route Structure

```
src/routes/
├── +layout.svelte             # Root layout component
├── +page.svelte               # Main application page at /
├── doc/[id]/                  # Public document viewer
├── mcp/                       # MCP integration endpoint
└── api/
    ├── documents/             # Document CRUD endpoints
    │   ├── +server.ts         # List and create documents
    │   └── [id]/              # Individual document operations
    │       └── metadata/      # Metadata-only endpoint
    └── public/documents/[id]/ # Public document access (no auth)
```

### Main Routes

**Root Route `/`**: Main application accessible without authentication (guest mode). Login/profile button visible in top menu.

**Authentication Flow**: See [AUTHENTICATION.md](AUTHENTICATION.md). Frontend initiates login via Auth.js `signIn(provider)`; callbacks through `/auth/*` routes.

**Guest Mode vs Authenticated Mode**:

- Guest users create and edit documents stored in browser localStorage only (5MB limit, no cross-device sync)
- Authenticated users get server persistence, cross-device sync, and full feature access
- Seamless transition between guest and authenticated modes

## Component Architecture

### Component Organization Strategy

**Feature Folders** (`src/lib/components/`):

- **DocumentList/**: Document list and item components
- **DocumentTeaser/**: Public document viewer teaser mode
- **Editor/**: DocumentEditor, VisualEditor, MetadataWidget, BodyEditor, MarkdownEditor (Advanced Mode)
- **NewDocumentModal/**: Document creation with template library browse/search/preview
- **Preview/**: Document preview components
- **RulerOverlay/**: Ruler overlay for layout measurements
- **Sidebar/**: Sidebar navigation and drawer components
- **TemplatePublishModal/**: Publish/manage template metadata and visibility
- **TopMenu/**: Top menu bar
- **Wizard/**: Schema-driven form generation for frontmatter editing
- **ui/**: Reusable UI primitives
- Root dialogs: DocumentInfoDialog, PublishModal, FeatureLoginModal, TemplateDivergenceBanner, ImportFileDialog

### Directory Structure

```
src/lib/components/
├── DocumentInfoDialog.svelte     # Document metadata dialog
├── PublishModal.svelte           # Document publishing controls
├── FeatureLoginModal.svelte      # Publish prompt for guests
├── ImportFileDialog.svelte       # File import dialog
├── KeyboardShortcutsModal.svelte # Keyboard shortcuts help modal
├── DocumentList/
├── DocumentTeaser/               # Public document viewer
├── Editor/
├── NewDocumentModal/
├── Preview/
├── RulerOverlay/
├── Sidebar/
├── TemplatePublishModal/
├── TopMenu/
├── Wizard/                       # SchemaForm, WizardCore, fields/
└── ui/
    ├── base-dialog.svelte
    ├── base-popover.svelte
    ├── base-select.svelte
    ├── base-sheet.svelte
    ├── button.svelte
    ├── dialog-content.svelte
    ├── download-button.svelte
    ├── dropdown-menu/
    ├── classification-banner.svelte
    ├── inline-editable-title.svelte
    ├── inline-input.svelte
    ├── input.svelte
    ├── label.svelte
    ├── portal.svelte
    ├── publish-button.svelte
    ├── switch.svelte
    ├── toast.svelte
    └── tooltip.svelte
```

### UI Library Architecture

Components in `src/lib/components/ui/`:

- **base-dialog.svelte**: Modal with focus trapping, ESC key, backdrop click
- **base-popover.svelte**: Dynamic positioning, click outside, ESC dismissal
- **base-sheet.svelte**: Slide-in drawer (mobile-friendly)
- **toast.svelte**: Toast notification container
- **switch.svelte**: Toggle switch with keyboard accessibility
- **portal.svelte**: Renders outside parent DOM
- No third-party UI dependencies (lucide-svelte for icons only)

## State Management

See [STATE_PATTERNS.md](./STATE_PATTERNS.md) for detailed state management patterns.

### Global Stores

Application-wide state using Svelte 5 runes (`$state`, `$derived`, `$effect`):

- **documentStore**: Document list, active document, loading states
- **toastStore**: Toast notifications (wrapper around svelte-sonner)
- Authentication state managed via server-side session (HTTP-only cookies)

## Server-Side Architecture

### API Routes

**Authentication** (`/auth/*`, managed by Auth.js):

- `GET/POST /auth/signin` - Provider selection and login
- `GET/POST /auth/signout` - Logout
- `GET /auth/callback/[provider]` - OAuth/OIDC callback handler
- `GET /auth/session` - Session inspection

**Documents** (`/api/documents/*`):

- `GET /api/documents` - List user documents
- `POST /api/documents` - Create document
- `GET /api/documents/[id]` - Get document with content
- `PUT /api/documents/[id]` - Update document
- `DELETE /api/documents/[id]` - Delete document
- `GET /api/documents/[id]/metadata` - Get metadata only

**Templates** (`/api/templates/*`):

- `GET /api/templates` - Browse templates (search, sort, tags, pagination)
- `POST /api/templates` - Publish a document as a template
- `GET /api/templates/[id]` - Get template detail + content snapshot
- `PUT /api/templates/[id]` - Update template metadata (owner only)
- `DELETE /api/templates/[id]` - Unpublish template (owner only)
- `POST/DELETE /api/templates/[id]/star` - Star or unstar a template
- `POST /api/templates/[id]/import` - Create a new document from template snapshot
- `PUT /api/templates/[id]/content` - Refresh published snapshot from linked document
- `PUT /api/templates/[id]/reset` - Reset linked document to last published snapshot
- `GET /api/templates/tags` - List tag options by category
- `GET /api/templates/by-document/[documentId]` - Resolve template for a linked document

### Session Management

JWT tokens stored in HTTP-only cookies, managed server-side. See [AUTHENTICATION.md](AUTHENTICATION.md) for token management details.

## Mobile Architecture

### Adaptive Layouts

- **Desktop**: Sidebar + split editor/preview
- **Tablet**: Drawer sidebar + collapsible preview
- **Mobile**: Full-screen drawer + tabbed editor/preview

### Breakpoints

See [DESIGN_TOKENS.md — Breakpoint Tokens](./DESIGN_TOKENS.md#breakpoint-tokens).
