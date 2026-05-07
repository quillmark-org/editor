# Local Collection Source Override

**Purpose**: Let developers iterate on `@tonguetoquill/collection` quills and templates without publishing to npm between each change.

**Status**: Proposed
**Related**: `scripts/package-quills.js`, `scripts/package-templates.js`, `CONTRIBUTING.md`

---

## Problem

Iterating on `@tonguetoquill/collection` today requires: publish → bump the dep version in `package.json` → `npm install` → `npm run pack` → `npm run dev`. The scripts read from `QUILLS_DIR` and `TEMPLATES_DIR` exported by the installed package (`scripts/package-quills.js:16`, `scripts/package-templates.js:16`), so there is no supported way to point them at a local checkout.

## Decisions

- **Env-var override, not `npm link` or `file:` deps.** Keeps `package.json` untouched, CI unaffected, and behavior opt-in per shell.
- **Split vars, not a single `COLLECTION_DIR`.** Quill and template iteration are independent flows; mixing local quills with published templates (or vice versa) is a real workflow. Starting split is easy to later alias with an umbrella var; starting merged is harder to reverse.
- **Names: `QUILL_SRC_DIR`, `TEMPLATE_SRC_DIR`.** Short, distinct from the JS identifiers `QUILLS_DIR` / `TEMPLATES_DIR` that the package exports.
- **No watch mode.** Re-running `npm run pack` manually is acceptable for now. A watch loop has non-trivial reload gotchas (quill re-registration, template DB re-seed) that are out of scope.

## Design

### `scripts/package-quills.js`

Replace the source-dir assignment (`scripts/package-quills.js:22`) with an env-var override that falls back to the package export:

```js
const QUILL_SRC_DIR = process.env.QUILL_SRC_DIR
	? path.resolve(process.env.QUILL_SRC_DIR)
	: QUILLS_DIR;

if (process.env.QUILL_SRC_DIR) {
	console.log(`[pack:quills] using local source: ${QUILL_SRC_DIR}`);
}
```

If the resolved path does not exist, fail loudly with a clear error before `FileSystemSource` is constructed — the silent-fallback trap is what makes env overrides frustrating.

### `scripts/package-templates.js`

Same shape, using `TEMPLATE_SRC_DIR`. Replaces the assignment at `scripts/package-templates.js:22`. Log line: `[pack:templates] using local source: …`.

### `src/lib/services/quillmark/registry-integration.test.ts`

Apply the same override at line 11: honor `QUILL_SRC_DIR` if set, otherwise use `QUILLS_DIR` from the package. Without this, `npm run test:unit` silently tests the published quills even when the packer is pointed at a local checkout — exactly the kind of desync this proposal exists to prevent.

### `CONTRIBUTING.md`

Add a short "Iterating on the collection" subsection under **Development Workflow** documenting the loop:

```sh
QUILL_SRC_DIR=../tonguetoquill-collection/quills npm run pack:quills
TEMPLATE_SRC_DIR=../tonguetoquill-collection/templates npm run pack:templates
npm run dev
```

Call out the two known caveats so they aren't surprises:

- **Template edits require a `vite dev` restart.** Official templates are seeded from the manifest once per server process in `src/lib/server/startup.ts:41`.
- **Quill edits require a hard browser reload.** The Quillmark engine caches registered quills for the page session.

## Scope

- Modify the two pack scripts and the one integration test; add ~10 lines to `CONTRIBUTING.md`.
- No changes to `package.json`, Vite config, CI, or runtime code.
- No changes to what's committed under `static/`.

## Non-goals

- Umbrella `COLLECTION_DIR` shorthand — trivial to add later if the two vars prove tedious.
- Watch-mode re-packing — separate proposal if we want it.
- Making template seeding idempotent on content-hash change — desirable, but a broader server-side change.
