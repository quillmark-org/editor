# Authentication Flow

**Purpose**: End-to-end OAuth authentication flow across all layers.

**TL;DR**: Auth.js-based OAuth/OIDC with GitHub/Google/USAF providers, DrizzleAdapter for database integration, JWT sessions, and optimistic guest-mode defaults.

---

## Authentication Architecture

### 1. Service Layer (Backend)

**Location**: `src/lib/server/auth.ts`

**Framework**: Auth.js (`@auth/sveltekit`) with DrizzleAdapter

**Providers**:

- **GitHub OAuth** - Production provider
- **Google OAuth** - Production provider
- **USAF OIDC** - Optional OIDC provider (when `AUTH_USAF_*` vars are configured)
- **Credentials (Mock)** - Development/staging mock login (when `AUTH_MOCK=true`)

**Key Design**: Leverages Auth.js for OAuth handling, session management, and callback processing. DrizzleAdapter provides database persistence for users and accounts.

**Helper Utilities**: `src/lib/server/utils/auth.ts`

- `requireAuth(event)` - Returns user or throws 401
- `optionalAuth(event)` - Returns user or null
- `getSession(event)` - Returns raw session object

### 2. Frontend Integration (Client)

**Location**: `src/lib/services/auth/login-client.ts`

**Responsibilities**:

- Initiate login via Auth.js signIn
- Check session via `event.locals.auth()` (SSR) or Auth.js client session APIs
- Handle logout via Auth.js signOut
- Guest mode fallback for unauthenticated users

### 3. UI Layer (Client)

**Components**: `src/lib/components/Sidebar/LoginPopover.svelte`

**Features**:

- Sign In button in sidebar (guest mode)
- User profile display (authenticated mode)
- Provider selection popover (configured providers)
- Logout action

---

## Complete Flow

### Login Flow

```
User → UI                   : Click "Sign In"
UI → LoginPopover           : Show provider selection
User → UI                   : Select provider (GitHub/Google)
UI → Auth.js                : signIn(provider)
Auth.js → Provider          : Redirect to OAuth provider
Provider → User             : User authorizes
Provider → Auth.js          : Callback with code
Auth.js → DrizzleAdapter    : Create/update user in database
Auth.js → Browser           : Set session cookie
Browser → UI                : Redirect to app
UI → Auth Store             : Update: isAuthenticated=true, user=...
UI → Document Store         : Fetch authenticated documents
```

### Mock Login Flow (Development)

```
User → UI                   : Click "Sign In" (mock mode)
UI → Auth.js                : signIn('credentials')
Auth.js → Credentials       : Authorize with mock user
Auth.js → DrizzleAdapter    : Create mock user if not exists
Auth.js → Browser           : Set session cookie
Browser → UI                : Redirect to app
```

### Logout Flow

```
User → UI                  : Click "Logout"
UI → Auth.js               : signOut()
Auth.js → Browser          : Clear session cookie
Browser → UI               : Redirect to app
UI → Auth Store            : Update: isAuthenticated=false, user=null
UI → Document Store        : Switch to guest mode (localStorage)
```

---

## Key Patterns

### Auth.js Integration

- Uses `@auth/sveltekit` for SvelteKit-native auth
- DrizzleAdapter connects to PostgreSQL database
- JWT sessions (no database session table)
- 7-day session duration

### Mock Mode

- Enabled via `AUTH_MOCK=true` environment variable
- Uses Credentials provider with auto-login
- Creates mock user in database if not exists
- Useful for local development without OAuth setup

### Optimistic Guest Mode

- App defaults to guest mode on load
- No blocking auth check on initial page load
- Seamless transition when auth resolves
- Documents stored in localStorage for guest users

### Session Management

- JWT stored in HTTP-only cookie
- Session validated via `event.locals.auth()`
- Automatic session refresh by Auth.js
- Clear on logout

---

## Error Handling

| Error           | Layer    | Behavior                            |
| --------------- | -------- | ----------------------------------- |
| Provider down   | Auth.js  | Return error, UI shows toast        |
| Invalid session | API      | Return 401, redirect to login       |
| Network error   | Frontend | Retry with exponential backoff      |

---

## Environment Variables

| Variable | Description |
| -------- | ----------- |
| `AUTH_SECRET` | Required secret for Auth.js (generate with `openssl rand -base64 32`) |
| `AUTH_GITHUB_ID` | GitHub OAuth App client ID |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App client secret |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `AUTH_MOCK` | Set to `true` to enable mock login (development/staging) |

---

## Implementation Files

- `src/lib/server/auth.ts`
- `src/lib/server/utils/auth.ts`
- `src/lib/services/auth/login-client.ts`
- `src/lib/components/Sidebar/LoginPopover.svelte`
- `src/hooks.server.ts`
