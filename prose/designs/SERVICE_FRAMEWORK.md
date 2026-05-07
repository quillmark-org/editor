# Service Framework

**Pattern for all services in Tonguetoquill (client and server).**

## Service Architecture

### Client vs Server Separation

**Server-Side Services** (`$lib/server/services/`):

- Provider implementations for databases and external services
- SvelteKit's `$lib/server/` convention ensures never bundled in client code
- Factory pattern for environment-based selection (mock vs production)
- Stateless request/response handling

**Client-Side Services** (`$lib/services/`):

- Abstract API communication and browser resources
- Unified interface regardless of guest vs authenticated mode
- Singleton pattern for browser-wide instance management
- Stateful resource caching (WASM, manifests, API data)

## Client Service Framework

### Pattern

Client services are single-instance with async initialization, ready state validation, and type-safe error handling.

**Examples**:

- QuillmarkService (WASM engine, Quill registry)
- TemplateService (template manifest, lazy content)
- DocumentClient (API integration, localStorage fallback)
- LoginClient (OAuth flow, session management)

### Lifecycle

**Initialization Flow**:

```
Application startup
  │
  ├─> Service getInstance()
  │   └─> Creates instance if needed
  │
  └─> Service initialize()
      │
      ├─> Check initialized flag
      │   └─> If true: return immediately (idempotent)
      │
      ├─> Load resources (WASM, manifests, etc.)
      │
      └─> Set initialized = true
```

**Operation Flow**:

```
Client calls service method
  │
  ├─> Validate initialization
  │   └─> Throw if not initialized
  │
  └─> Execute business logic
```

### Base Class Pattern

**Framework Provides**:

- Singleton instance management (private constructor, getInstance())
- Idempotent initialization wrapper
- Ready state tracking (isReady(), validateInitialized())
- Type-safe abstract base class

**Services Implement**:

- doInitialize() hook for resource loading
- Business logic methods
- Service-specific interfaces
- Domain error handling

## API Integration Pattern

### Architecture

**Base Configuration**:

- Base URL: Relative paths (same-origin API routes)
- Credentials: Automatic cookie inclusion (HTTP-only JWT)
- Error handling: Application-level retry for transient failures
- Timeout: Default browser timeout

**Endpoints**:

- `/auth/*` - Authentication routes managed by Auth.js
- `/api/documents/*` - Document CRUD
- `/api/documents/[id]/metadata` - Document metadata

### Client Pattern

**Two Approaches**:

1. **Service Classes**: Centralized client for complex operations

   - DocumentClient: Routes between localStorage (guest) and API (auth)
   - LoginClient: OAuth flow management
   - Provides unified interface for stores/components

2. **Direct fetch()**: Simple operations and authentication checks
   - Used in page load functions for session checks
   - Used for one-off API calls

**Features**:

- Simple async/await API
- Optimistic updates for responsive UX
- Guest mode fallback to localStorage
- Error handling via try/catch

### HTTP Methods

- **GET**: Fetch resources (documents, user info)
- **POST**: Create resources, trigger actions
- **PUT**: Update resources
- **DELETE**: Remove resources

### Error Handling

**Network Errors**:

- Try/catch for fetch failures
- Toast notifications for user feedback
- Retry option for transient failures

**HTTP Errors**:

- Check `response.ok` before parsing
- 400: Validation errors (inline feedback)
- 401: Authentication required (fallback to guest mode)
- 403: Permission denied (error message)
- 404: Resource not found (empty state or error)
- 500: Server errors (user-friendly message)

**Optimistic Updates**:

1. Update local state immediately
2. Send request to server
3. On success: Keep update
4. On error: Rollback + show error toast

## Server Service Framework

### Factory Pattern

- Environment-based provider selection (mock vs production)
- No initialization boilerplate needed
- Stateless request/response
- Clean factory functions

**Examples**:

- Document provider (Drizzle ORM with pglite/neon/pg drivers)
- User provider (Auth.js with DrizzleAdapter)

**Pattern**:

```typescript
// Factory selects database driver based on environment
export function getDb() {
	const driver = DATABASE_DRIVER; // pglite, neon, or pg
	return drizzle(getConnection(driver), { schema });
}

// Service uses Drizzle ORM
export const documentService = {
	async listDocuments(userId: string) {
		const db = getDb();
		return db.query.documents.findMany({
			where: eq(schema.documents.ownerId, userId)
		});
	}
	// ...
};
```

**No Abstraction Needed**: Factory pattern is already clean with minimal overhead

## Service Implementation Guidelines

### Client Services

**When to Create**:

- Needs to run in browser
- Requires async initialization (WASM, manifests)
- Manages stateful resources
- Used across multiple components

**Implementation Steps**:

1. Extend ClientService base class
2. Implement doInitialize() for resource loading
3. Add business methods with validateInitialized() checks
4. Define service-specific error types
5. Export singleton instance

### Server Services

**When to Create**:

- Needs server-only APIs (database, external services)
- Stateless request/response pattern
- Environment-based behavior (mock vs production)

**Implementation Steps**:

1. Define service interface
2. Implement service using Drizzle ORM
3. Create database factory for driver selection (pglite/neon/pg)
4. Handle migrations and schema initialization
5. Export service functions

### API Clients

**When to Create**:

- Manages complex API communication
- Needs guest/auth mode switching
- Requires optimistic updates
- Shared across multiple stores/components

## Authentication Context

**Server-Side**:

- Middleware validates JWT and extracts user ID
- Services perform ownership/permission checks
- `requireAuth()` utility for protected routes
- Returns 401 if not authenticated

**Client-Side**:

- Check session via `event.locals.auth()` in server load
- Set guest mode based on 401 response
- Guest mode: localStorage persistence
- Authenticated mode: API sync

## Error Patterns

### Client Service Errors

**Not Initialized**:

- Thrown when methods called before initialize()
- Includes service name and helpful message
- Guides developer to call initialize() first

**Domain Errors**:

- Service-specific error types
- Errors from doInitialize() propagate through framework
- Business operation errors handled by service

### API Client Errors

**Network Errors**:

- Toast notification with retry option
- Rollback optimistic updates
- Fallback to guest mode if applicable

**Validation Errors**:

- Inline form errors
- Error summary for complex forms

**Permission Errors**:

- Redirect to login or error message
- Clear explanation of required permissions

**Server Errors**:

- User-friendly message (hide implementation details)
- Error logging for debugging

## Cross-References

- [ERROR_SYSTEM.md](ERROR_SYSTEM.md) - Error handling patterns
- [STATE_PATTERNS.md](STATE_PATTERNS.md) - Store integration
- [AUTHENTICATION.md](AUTHENTICATION.md) - OAuth flow details
- [ARCHITECTURE.md](ARCHITECTURE.md) - Overall app structure

**Service READMEs**:

- `src/lib/services/quillmark/README.md` - QuillmarkService implementation
- `src/lib/services/templates/README.md` - TemplateService implementation

**Note**: Other services (auth/login-client.ts, documents/document-client.ts) follow the patterns described in this document without individual READMEs. Their implementations can be found in their respective directories under `src/lib/services/`.
