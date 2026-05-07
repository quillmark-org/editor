# Tonguetoquill Web

A professional markdown document editor.

## Technology Stack

- **Framework**: SvelteKit 5 (full-stack: frontend + backend)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4.0
- **Editor**: ProseMirror + CodeMirror 6
- **Rendering**: Quillmark (`@quillmark/wasm`) for typeset preview/export
- **Database**: PostgreSQL with Drizzle ORM (pglite for dev, neon/pg for production)
- **Authentication**: Auth.js with GitHub, Google, and Mock providers
- **Development**: Mock services for rapid AI agent development
- **Deployment**: Vercel (adapter-auto), Node adapter, or Docker for self-hosting

## Getting Started

### Prerequisites

- Node.js 20.x or later
- npm 10.x or later

### Installation

1. Clone the repository:

```sh
git clone https://github.com/nibsbin/tonguetoquill-web.git
cd tonguetoquill-web
```

2. Install dependencies:

```sh
npm install
```

3. Configure environment variables. The repo ships two preset env files loaded
   by Vite's `--mode` flag:
   - `.env.dev` — full dev stack (mock auth + pglite, OAuth credentials present)
   - `.env.mock` — minimal mock-only configuration

   Copy or edit them as needed. See `SELF_HOSTING.md` for production setup.

4. Start the development server:

```sh
npm run dev          # uses .env.dev
npm run dev:mock     # uses .env.mock (mock auth, pglite)

# or open the app in a new browser tab
npm run dev -- --open
```

## Development Scripts

- `npm run dev` — Run development server (mode: `dev`)
- `npm run dev:mock` — Run development server in pure mock mode
- `npm run build` — Build for production
- `npm run preview` — Preview production build
- `npm run test:unit` — Run unit tests (Vitest)
- `npm run test:e2e` — Run end-to-end tests (Playwright)
- `npm run check` — Type check and validate (svelte-check)
- `npm run lint` — Prettier check + ESLint
- `npm run format` — Prettier write
- `npm run pack` — Package quills and templates (runs both pack scripts below)
- `npm run pack:quills` — Build quill bundles via `scripts/package-quills.js`
- `npm run pack:templates` — Build template bundles via `scripts/package-templates.js`
- `npm run db:push` — Push Drizzle schema to the database
- `npm run db:migrate` — Run pending Drizzle migrations
- `npm run db:studio` — Open Drizzle Studio

## Project Structure

```
src/
├── lib/                 # Reusable components, services, stores, utilities
│   ├── branding.ts      # Title/classification branding helpers
│   ├── components/      # Svelte UI components
│   ├── config/          # Runtime configuration
│   ├── editor/          # ProseMirror/CodeMirror editor integration
│   ├── errors/          # Typed error classes
│   ├── features/        # Feature modules (e.g. editor-page)
│   ├── icons/           # Icon components
│   ├── parsing/         # Markdown / frontmatter parsing
│   ├── server/          # Server-side services (auth, documents, templates)
│   ├── services/        # Client-side services
│   ├── stores/          # Svelte stores / state management
│   ├── utils/           # Helper functions
│   └── version.ts       # Build version constant
├── routes/              # Route-based pages and API endpoints
│   ├── doc/             # Authenticated document editor
│   ├── signin/          # Sign-in page
│   ├── terms/           # Terms of service
│   └── api/             # API endpoints (auth, documents, templates,
│                        #   feedback, beta-program, cron, health, metrics, public)
├── hooks.server.ts      # Server-side middleware (authentication, headers)
└── service-worker.ts    # PWA service worker
```

## Authentication

The application uses **Auth.js** for OAuth-based authentication with external providers:

- **GitHub OAuth**: Production OAuth provider
- **Google OAuth**: Production OAuth provider
- **Mock Provider (Development)**: Simulates OAuth flow for local development

**Authentication Flow:**

1. User clicks login → redirected to provider's hosted login page
2. Provider authenticates user and redirects back with OAuth code
3. Auth.js creates/updates user in database via DrizzleAdapter
4. Session tokens stored in secure HTTP-only cookies (JWT-based)

The application **never sees or handles passwords** - all password management is delegated to the auth provider.

### Ephemeral MCP claim links

When `features.mcp.enabled` is on, `create_document` returns an ephemeral URL (`/ephemeral/<id>`). Ownership is intentionally **possession-based**: the first authenticated account to open the link claims the draft. Treat these links as bearer secrets (do not paste into public channels), because link possession determines who can claim and promote the document.

## Environment Variables

See `.env.dev` and `.env.mock` for the development presets. Key variables:

**Development (Mock Provider):**

- `AUTH_MOCK=true` - Enable mock authentication provider
- `AUTH_SECRET` - Secret key for Auth.js (generate with `openssl rand -base64 32`)
- `DATABASE_DRIVER=pglite` - Use in-memory PostgreSQL for development
- `DISABLE_MOBILE=false` - When `true`, show a "Mobile version coming soon" screen on mobile/portrait viewports

**Production (OAuth Providers):**

- `AUTH_MOCK=false` - Use real OAuth authentication (default)
- `AUTH_SECRET` - Secret key for Auth.js session encryption
- `AUTH_GITHUB_ID` - GitHub OAuth App client ID
- `AUTH_GITHUB_SECRET` - GitHub OAuth App client secret
- `AUTH_GOOGLE_ID` - Google OAuth client ID
- `AUTH_GOOGLE_SECRET` - Google OAuth client secret
- `DATABASE_DRIVER=neon` - Use Neon serverless PostgreSQL for production
- `DATABASE_URL` - PostgreSQL connection string
- `FEEDBACK_GITHUB_KEY` - Fine-grained GitHub personal access token used by `POST /api/feedback` for GitHub issue creation
- `FEEDBACK_GITLAB_KEY` - Personal access token used by `POST /api/feedback` for GitLab issue creation

## Mock Provider Strategy

Development mode uses **mock providers** to enable fast development without external dependencies.

Benefits:

- ✅ Fast environment startup with in-memory database (pglite)
- ✅ No Docker/external dependencies
- ✅ Deterministic testing
- ✅ Easy debugging
- ✅ Offline development

## Feature Scope

### Included

- Single-user document editing
- User authentication (GitHub, Google, mock for dev)
- Markdown editor with formatting toolbar
- Live preview pane via Quillmark (`@quillmark/wasm`)
- Document templates (USAF/USSF memos and more under `templates/`)
- Auto-save with debounce
- Document list (create, open, delete)
- Mobile-responsive layout
- Section 508 compliance
- Keyboard shortcuts

### Not yet supported

- Document sharing / real-time collaboration
- Version history
- Full offline support
- Advanced search and filtering

## Building for Production

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

## Deployment

This project supports Vercel (via `adapter-auto`/`adapter-vercel`), a Node.js
server (`adapter-node`), and Docker-based self-hosting. See `DEPLOYMENT.md` and
`SELF_HOSTING.md` for full instructions. Configure environment variables for
production:

- Set `DATABASE_DRIVER=neon` and provide `DATABASE_URL`
- Configure OAuth providers (GitHub, Google) with client IDs and secrets
- Set `AUTH_SECRET` for session encryption
- Set either `FEEDBACK_GITHUB_KEY` (GitHub issues) or `FEEDBACK_GITLAB_KEY` (GitLab issues) for beta feedback submission
- Enable `features.cron.enabled: true` in your deployment YAML and set `CRON_SECRET` to expose authenticated `/api/cron/*` maintenance endpoints (when disabled, the routes return 404)

### Dynamic Chunk Recovery (Best Practice)

After a fresh deployment, users may still have an older client shell open that references outdated hashed chunks.  
To handle this cleanly, the app registers a global `vite:preloadError` handler in `src/app.html` that:

- calls `event.preventDefault()` to suppress default Vite error propagation
- triggers a one-time `window.location.reload()` to fetch the latest deployment assets
- uses `sessionStorage` key `ttq:reloaded-for-preload-error` to prevent reload loops

This keeps stale-chunk recovery at app startup/runtime boundaries (instead of feature-specific services like auth).

## Documentation

- `prose/designs/` — Technical design documents (architecture, patterns, systems)
- `prose/reference/` — Reference documentation (API endpoints, extended markdown)
- `prose/proposals/` — Feature proposals and RFCs
- `prose/refactor/` — Refactor notes
- `prose/security/` — Security notes
- `proposals/taskings/` — Task hand-offs
- `CHANGELOG.md`, `CONTRIBUTING.md`, `DEPLOYMENT.md`, `SELF_HOSTING.md` — Top-level guides

See [prose/designs/INDEX.md](prose/designs/INDEX.md) for the full design-doc index.

## License

MIT
