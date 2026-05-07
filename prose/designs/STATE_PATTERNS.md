# State Patterns

**Purpose**: Unified state management patterns that eliminate store boilerplate through composable factory functions.

**Cross-references**:

- Implementation: See `src/lib/stores/` and `src/lib/components/Editor/DocumentEditor.svelte`
- Error handling: See `ERROR_SYSTEM.md`
- Architecture: See `ARCHITECTURE.md`
- Wizard dirty tracking: See `WIZARD_DIRTY_TRACKING.md`
- Placeholders & fill semantics: See [MD_PLACEHOLDERS.md](MD_PLACEHOLDERS.md)

## Desired State

### Store Factory Functions

Three factory functions that encapsulate common patterns:

**Collection Store Factory**:

- Creates stores for managing arrays of items
- Provides: items array, loading state, error state, active item selection
- Auto-generates: CRUD methods, derived activeItem getter
- Optional: async fetcher integration, optimistic updates

**Registry Store Factory**:

- Creates stores for managing Map-based collections
- Provides: Map storage, register/unregister methods
- Auto-generates: has(), count(), getAll() queries
- Optional: priority-based operations, automatic cleanup

**Simple State Factory**:

- Creates stores for primitive or simple object state
- Provides: reactive state with getters
- Auto-generates: setters, toggle methods for booleans
- Optional: localStorage persistence, initialization hooks

## Pattern Specifications

### Collection Store Pattern

**State Structure**:

- items: T[] - Array of items
- activeId: string | null - Selected item ID (optional)
- isLoading: boolean - Async operation state (optional)
- error: string | null - Error message (optional)

**Generated Methods**:

- add(item: T) - Add item to collection
- update(id: string, updates: Partial<T>) - Update item by ID
- remove(id: string) - Remove item by ID
- setActiveId(id: string | null) - Set active selection

**Generated Getters**:

- get items() - Array of items
- get activeItem() - Derived from activeId + items lookup
- get isLoading() - Loading state
- get error() - Error message

**Extension Points**:

- Custom fetcher function for async loading
- Custom update logic (merge strategies, optimistic updates)
- Custom validation on mutations

### Registry Store Pattern

**State Structure**:

- registry: Map<string, T> - Map of items by ID

**Generated Methods**:

- register(id: string, item: T) - Add item to registry
- unregister(id: string) - Remove item from registry
- has(id: string) - Check if item exists
- get(id: string) - Get item by ID
- getAll() - Get all items as array
- clear() - Remove all items

**Generated Getters**:

- get count() - Number of items in registry
- get isEmpty() - Whether registry is empty

**Extension Points**:

- Custom registration logic (validation, side effects)
- Custom unregistration cleanup
- Priority-based operations

### Simple State Pattern

**State Structure**:

- Primitive value (boolean, string, number) or simple object

**Generated Methods** (based on type):

- For boolean: toggle(), setActive(value: boolean)
- For any type: set(value: T)
- For objects: update(partial: Partial<T>)

**Generated Getters**:

- get value() or named getter for state

**Extension Points**:

- LocalStorage persistence (auto-sync on change)
- Initialization hooks (load from storage, setup listeners)
- Cleanup hooks (remove listeners, persist final state)

## Implementation Patterns

### Auto-Save Pattern

**Implementation**: `src/lib/utils/auto-save.svelte.ts`

**Pattern**:

```typescript
class AutoSave {
	// Configurable debounce timer (4 seconds default)
	// Save status tracking (idle, saving, saved, error)
	// Support for guest (localStorage) and authenticated (API) modes
	// Proper cleanup of timers
	// Manual save support (Ctrl/Cmd+S bypasses debounce)
}
```

**Integration**: Used in DocumentEditor component

**Features**:

- Tracks dirty state (unsaved changes)
- Triggers auto-save on content changes (4 second debounce)
- Respects user's auto-save preference
- Updates initialContent after successful save
- Save status indicator shows current state

**See Also**: See SERVICE_FRAMEWORK.md for API integration patterns

### Dual Storage Strategy (Guest Mode)

**Document Store Pattern**: Routes between localStorage (guest) and API (authenticated)

**Guest Mode** (localStorage):

- Key: `tonguetoquill_guest_documents`
- Format: JSON array with metadata + content
- Limit: 5MB (configurable)
- Quota checking before each save
- Error handling for quota exceeded

**Authenticated Mode** (API):

- Full CRUD through REST endpoints
- Server persistence
- No localStorage usage (except offline cache)

**Migration on Login**:

- Offer to import localStorage documents on first login
- User chooses which documents to import
- Clear localStorage after successful migration
- Handle conflicts if document names exist

**Implementation**: `src/lib/services/documents/document-browser-storage.ts`

```typescript
interface LocalStorageDocumentService {
	createDocument(name, content): Promise<DocumentMetadata>;
	getDocumentContent(id): Promise<{ id; content; name }>;
	updateDocumentContent(id, content): Promise<void>;
	deleteDocument(id): Promise<void>;
	listUserDocuments(): Promise<DocumentMetadata[]>;

	// Helper methods
	getAllDocumentsWithContent(): StoredDocument[];
	clear(): void;
	getStorageInfo(): { used; max; percentUsed };
}
```

### Authentication State Pattern

**Authentication Store Structure**:

```typescript
{
  user: User | null,           // null = guest mode
  isAuthenticated: boolean,     // false for guests
  isGuest: boolean,             // computed from user === null
  loading: boolean,
  login: (credentials) => Promise<void>,
  logout: () => Promise<void>,
  checkAuth: () => Promise<void>
}
```

**Guest Mode Handling**:

- `isGuest` computed from `user === null`
- Guest mode is default on app load
- Auth check runs in background without blocking
- Components conditionally render based on `isGuest`

### Document Store Pattern

**Store Structure**:

```typescript
{
  documents: DocumentMetadata[],
  activeDocumentId: string | null,
  loading: boolean,
  error: string | null,

  // Operations
  createDocument: (name, content) => Promise<Document>,
  getDocument: (id) => Promise<Document>,
  updateDocument: (id, updates) => Promise<Document>,
  deleteDocument: (id) => Promise<void>,
  listDocuments: () => Promise<DocumentMetadata[]>,

  // Guest mode specific
  isLocalStorageMode: boolean,
  migrateLocalDocuments: () => Promise<void>
}
```

**Usage**: Collection factory pattern with custom CRUD implementation

### Preferences Store Pattern

**Preferences Persisted to localStorage**:

- Auto-save setting (enabled/disabled)
- Font size (optional)
- Editor settings
- UI state (sidebar expanded/collapsed)

**Strategy**:

- Load on mount
- Save on change
- Handle storage events for cross-tab sync

### State Selection Guidelines

**Component-Local State** (use `$state` rune):

- UI state (expanded, selected, focused)
- Form inputs
- Temporary calculations
- Data that doesn't need sharing

**Global Stores** (use factory patterns):

- Application-wide state (auth, preferences, documents)
- Cross-component communication
- Persistent state
- Shared derived state

**Form Actions** (server-side):

- Server-validated data
- Database operations
- File uploads
- Authentication flows

**Context API** (Svelte contexts):

- Dependency injection
- Feature-specific state
- Avoiding prop drilling
- Component tree configuration

**Page Data** (SSR):

- Initial page data loaded on server
- Route-specific data
- URL-based state
- SEO-critical data

### State Best Practices

**Keep State Close**: Component-local when possible, elevate only when needed

**Avoid Over-Storing**: Don't duplicate data across stores

**Normalize Data**: Use IDs and lookups for related data

**Derive Don't Duplicate**: Compute values from source data

**Clean Up**: Always clean up effects, subscriptions, listeners

**Minimize Reactivity**: Only make reactive what needs reactivity

**Batch Updates**: Group related state changes

**Debounce Expensive Operations**: Delay updates for rapid changes (auto-save)

**Type Safety**: TypeScript interfaces for all state, validate runtime data

## Related Patterns

**Service Layer**: See `SERVICE_FRAMEWORK.md` for singleton service pattern and API integration

**Error Handling**: See `ERROR_SYSTEM.md` for error state management in stores

**Architecture**: See `ARCHITECTURE.md` for component-local state patterns
