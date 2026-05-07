# Contributing to TongueToQuill Web

Thanks for your interest in contributing! This guide covers the essentials for getting up and running.

## Prerequisites

- **Node.js** 24.x (see `.nvmrc`)
- **npm** 10.x or later

## Setup

```sh
git clone https://github.com/nibsbin/tonguetoquill-web.git
cd tonguetoquill-web
npm install
cp .env.example .env
npm run dev
```

The dev server uses **mock auth** and an **in-memory PGlite database** by default — no external services required.

## Development Workflow

1. Create a feature branch off `main`.
2. Make your changes.
3. Ensure all checks pass before pushing:

```sh
npm run check          # TypeScript / Svelte validation
npm run lint           # ESLint + Prettier check
npm run test:unit      # Vitest unit tests
npm run test:e2e       # Playwright end-to-end tests
```

4. Open a pull request against `main`.

### Iterating on the collection

To iterate on a local checkout of `@tonguetoquill/collection` without publishing to npm:

```sh
QUILL_SRC_DIR=../tonguetoquill-collection/quills npm run pack:quills
TEMPLATE_SRC_DIR=../tonguetoquill-collection/templates npm run pack:templates
npm run dev
```

- Template edits require a `vite dev` restart (official templates are seeded once per server process).
- Quill edits require a hard browser reload (registered quills are cached for the page session).

## Code Style

This project enforces consistent formatting via **Prettier** and **ESLint**. A **Husky** pre-commit hook runs `lint-staged` automatically, so committed files are always formatted.

Key Prettier settings (`.prettierrc`):

- Tabs for indentation
- Single quotes
- No trailing commas
- 100-character print width

## Project Structure

```
src/
├── lib/
│   ├── components/      # Svelte UI components
│   ├── services/        # Client-side services
│   ├── server/          # Server-side services
│   ├── stores/          # State management
│   └── utils/           # Helper functions
├── routes/              # SvelteKit pages & API endpoints
└── hooks.server.ts      # Server middleware
```

See the [README](README.md) for more detail on the full project structure and technology stack.

## Tech Stack at a Glance

| Layer      | Technology                       |
| ---------- | -------------------------------- |
| Framework  | SvelteKit 5                      |
| Language   | TypeScript                       |
| Styling    | Tailwind CSS 4                   |
| Database   | PostgreSQL (Drizzle ORM)         |
| Auth       | Auth.js (GitHub, Google, Mock)   |
| Testing    | Vitest (unit) + Playwright (e2e) |
| Deployment | Vercel                           |

## Documentation

Design docs, proposals, and reference material live under `prose/`:

- `prose/designs/` — Architecture & technical designs
- `prose/reference/` — API & feature reference
- `prose/proposals/` — RFCs and feature proposals

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
