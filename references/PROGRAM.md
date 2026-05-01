# `@quillmark/editor` Program

**Audience**: senior SWE who will plan and execute implementation.

---

## 1. Context

The current `BodyEditor` in `tonguetoquill-web` is a ProseMirror integration. The
schema, parser, serializer, custom commands, and keymap span roughly 2,900 lines
of source plus 1,880 lines of tests across `src/lib/editor/prosemirror/`. The
integration is:

- **Heavy** — ~169 KB gzipped of editor packages.
- **Brittle** — table reordering, list indent/outdent, and parser fallback all
  contain bug-fix scar tissue (`list-commands.ts` is 700 lines, `table-commands.ts`
  is 565).
- **Hard to extend** — adding a new mark or node requires touching the schema,
  the parser tokens, and the serializer in three coupled places.

Two spikes (both reset off this branch but recoverable via reflog) validated
the approach:

- **BodyEditor spike** (commit `459ae55`) replaced the editor core with Meta's
  [Lexical](https://lexical.dev/) and `@lexical/markdown`. Bundle dropped to
  ~76 KB gzipped (−55%); custom-extension surface area dropped substantially
  (declarative `Transformer` objects in place of coupled schema/parser/serializer
  edits).
- **Tables spike** (commit `d5c5af3`) confirmed `@lexical/table` is framework-
  agnostic and that most table operations — insert/delete row/col, merge/unmerge,
  column reorder — ship in `@lexical/table` core. The custom markdown
  transformer for pipe tables fits in ~120 lines (sample preserved at the
  cited commit).

List edge cases remain real engineering until audited; tables proved
substantially less work than initially feared (see §6.2 O4). Numbers above
include only the editor-core packages, not the surrounding UI (cards, schema
form, drag-and-drop), which the new package will own.

---

## 2. Goals & Non-goals

### Goals

1. Replace the ProseMirror BodyEditor with Lexical, with feature parity for
   tonguetoquill-web's existing functionality.
2. Ship as `@quillmark/editor`, a single npm package consumable by:
   - Svelte 5 hosts (tonguetoquill-web), as a tree-shakable component library.
   - Any HTML host (MS Teams, MCP Apps iframes, vanilla web pages, React/Vue/Angular hosts), as a self-contained custom element.
   - Server / AI-agent code, as a headless document model with no DOM dependency.
3. Encompass the full **VisualEditor** scope: BodyEditor (rich text), card model
   with drag-and-drop reordering, schema-driven metadata form, frontmatter
   handling.
4. Round-trip QuillMark markdown losslessly for the document shapes
   tonguetoquill-web ships today, including inline metadata blocks.

### Non-goals

- **Auth, persistence, routing, app chrome** — the package is a controlled,
  stateless component. The host owns these.
- **Quill / WASM fetching strategy** — exposed via injected callback, not
  bundled. The package never calls `fetch`.
- **Telemetry transport** — exposed as a hook; the host wires its own analytics.
- **A React component adapter** — see §6. Deferred indefinitely; React hosts
  consume the custom element.
- **Server-side rendering of the editor** — the editor is client-only. The
  headless `core` is callable from server code, but for document manipulation,
  not for rendering an editable surface.
- **Real-time collaboration / CRDTs** — out of scope for v1. Lexical has Yjs
  bindings if this is later required.
- **Editor-mode switch (visual ↔ markdown source view).** The current
  `MarkdownEditor.svelte` + `EditorModeSwitch.svelte` read as host-app chrome.
  Not included in the package; tonguetoquill-web composes them around the
  package if it still wants the toggle.
- **Resizable split panel.** Same reasoning as above — UI shell, not an editor
  concern.

---

## 3. Consumers & Use cases

| Consumer | Surface | Transport |
|---|---|---|
| tonguetoquill-web | Svelte component imports (`@quillmark/editor`) | Direct in-page; props/events |
| MS Teams plugin | Custom element, iframe-embedded | postMessage (Teams JS SDK + WC) |
| ChatGPT / MCP Apps host | Custom element, iframe-embedded | MCP Apps `ui/*` JSON-RPC over postMessage |
| 3rd-party SaaS | Custom element via `<script>` tag | Props/events on the element |
| AI agent / server tooling | Headless `core` import | Function calls; no DOM |

The MCP Apps standard ([blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/))
is supported by ChatGPT, Claude, Goose, and VS Code as of early 2026 — a single
custom-element implementation covers multiple AI platforms.

---

## 4. Architecture

### 4.1 Single package, three entry points

```
@quillmark/editor
├── .              → Svelte 5 components, peer-deps svelte. Tree-shakable.
├── ./element      → Self-contained custom element bundle. Includes Svelte runtime.
└── ./core         → Headless TS. No DOM, no framework. Document model + Lexical config.
```

Resolved via `package.json` conditional `exports`:

```jsonc
{
  "exports": {
    ".":         { "svelte": "./dist/svelte/index.js",
                   "import":  "./dist/svelte/index.js",
                   "types":   "./dist/svelte/index.d.ts" },
    "./element": { "import":  "./dist/element.js",
                   "types":   "./dist/element.d.ts" },
    "./core":    { "import":  "./dist/core/index.js",
                   "types":   "./dist/core/index.d.ts" }
  },
  "peerDependencies": { "svelte": "^5.0.0" }
}
```

### 4.2 Internal layering

```
                          ┌──────────────────────────────┐
  ./element entry  ───►   │  Svelte WC bundle (one file) │
                          │  └─ wraps Svelte UI          │
                          └──────────────┬───────────────┘
                                         │
                          ┌──────────────▼───────────────┐
  . entry          ───►   │  Svelte 5 components          │
                          │  VisualEditor / Card /        │
                          │  BodyEditor / SchemaForm /    │
                          │  SelectionToolbar / etc.      │
                          └──────────────┬───────────────┘
                                         │ depends on
                          ┌──────────────▼───────────────┐
  ./core entry     ───►   │  Headless logic              │
                          │  - Lexical editor config      │
                          │  - Custom nodes & transformers│
                          │  - Document parse/serialize   │
                          │  - Card model                 │
                          │  - Schema-form interpreter    │
                          │  - Commands                   │
                          └──────────────────────────────┘
```

**The core/UI split is enforced** even with a single Svelte UI implementation,
because:

- Tests live in `core` and run without a Svelte runtime (faster, simpler CI).
- The document model is callable from server / AI-agent code.
- A future React adapter, if ever required, is bounded to a UI port — the
  document model and editor logic do not get re-derived.
- Discipline: prevents business logic from leaking into Svelte components.

### 4.3 Embedded mode (MCP Apps / Teams)

The custom element auto-detects whether it's running inside an MCP Apps
iframe (presence of `window.openai` / MCP Apps bridge globals — confirm against
[developers.openai.com/apps-sdk/build/chatgpt-ui](https://developers.openai.com/apps-sdk/build/chatgpt-ui)
when implementing).

- **Standalone mode** (default): document state via the `document` attribute
  / property, changes via a `quillmark-change` `CustomEvent`. Same as a normal
  custom element.
- **Embedded mode**: when the MCP Apps bridge is present, document load and
  save flow through the bridge (`ui/*` JSON-RPC over postMessage). The host
  page does not need to wire `onChange` — the editor speaks to the platform
  directly.

Same component, two transport modes. Selecting between them is an internal
detail; consumers do not configure it.

---

## 5. Public API contract

The package boundary is **at the document level, not the component level**.
Consumers get a pre-assembled VisualEditor; they do not compose primitives.

### 5.1 Svelte entry

```svelte
<script lang="ts">
  import { VisualEditor } from '@quillmark/editor';
  import type { QuillManifest } from '@quillmark/editor';

  let document = $state('# Hello');
  const quills: QuillManifest[] = [/* ... */];
</script>

<VisualEditor
  bind:document
  {quills}
  theme="auto"
  onChange={(md) => save(md)}
  renderPreview={async (md, quillId) => {/* host's WASM renderer */}}
  features={{ tables: true, cards: true, dragDrop: true }}
  classification={{ banner: 'CUI', bannerPosition: 'top' }}
/>
```

### 5.2 Custom element entry

```html
<script type="module" src="https://unpkg.com/@quillmark/editor/element"></script>

<quillmark-editor
  document="# Hello"
  theme="auto"
  features='{"tables":true,"cards":true,"dragDrop":true}'>
</quillmark-editor>

<script>
  const el = document.querySelector('quillmark-editor');
  el.quills = [/* ... */];                              // complex props as properties
  el.renderPreview = async (md, q) => {/* ... */};
  el.addEventListener('quillmark-change', (e) => save(e.detail.markdown));
</script>
```

### 5.3 Core entry

```ts
import { parseDocument, serializeDocument, type QuillmarkDocument } from '@quillmark/editor/core';

const doc: QuillmarkDocument = parseDocument(markdown);
// inspect / mutate / serialize without a DOM
const md: string = serializeDocument(doc);
```

### 5.4 Inputs the consumer provides

| Input | Type | Required |
|---|---|---|
| `document` | `string` (QuillMark markdown) | yes |
| `quills` | `QuillManifest[]` | yes |
| `onChange` / `quillmark-change` event | callback / event | yes |
| `theme` | `'light' \| 'dark' \| 'auto'` or token map | no |
| `features` | feature flags (tables, cards, dragDrop, etc.) | no |
| `classification` | classification banner config | no |
| `renderPreview` | injected callback for WASM-based preview rendering | no |
| `onTelemetry` | injected callback for analytics events | no |
| `onParseFallback` | error callback for non-recoverable markdown | no |

### 5.5 What the consumer does NOT get

- Direct access to the Lexical `editor` instance.
- Imperative commands beyond a small documented set (`focus`, `blur`,
  `getMarkdown`).
- Sub-component composition (no rendering the toolbar separately from the
  canvas).
- Internal state observation beyond `onChange`.

This is deliberate. Reach-in APIs are how the ProseMirror version became a
1,500-line custom-commands codebase; the package contract is "you give us
markdown and config, we give you an editor."

---

## 6. Decisions

### 6.1 Made

- **Lexical replaces ProseMirror.** Spike validates round-trip + bundle gains.
- **Svelte 5 is canonical for the UI.** No React adapter; React hosts use the
  custom element. React 19 makes custom elements first-class citizens (props,
  events, refs all work).
- **Single npm package** with three entry points, not three packages. The build
  pipeline is more involved (two Vite library configs + a Rollup config for
  the WC); the consumer story is dramatically simpler.
- **Boundary at the document level**, not the component level. Consumers
  receive a fully assembled VisualEditor.
- **`core` is headless and framework-neutral.** Even though the only UI today
  is Svelte, the split is non-negotiable for testability and future-proofing.
- **`@quillmark/editor-mcp` is deferred.** A Node-side MCP server skeleton is
  a separate package when needed (different deploy target, different deps); not
  built until a real MCP integration is on the roadmap.

### 6.2 Open — to resolve early in implementation

| # | Question | Constraint |
|---|---|---|
| O1 | **WASM rendering** ownership: does the package include the renderer, or accept an injected `renderPreview` callback? | Embedded iframe contexts must not pay the WASM cost unless preview is actually shown. Recommendation: injected callback. |
| O2 | **Theming**: shadow DOM in the custom element, or light DOM with CSS custom properties? | Shadow DOM isolates host CSS but breaks design-token inheritance. Recommendation: light DOM + namespaced classes + CSS custom properties; document the conflict surface. |
| O3 | **Drag-and-drop primitive**: native HTML5 DnD or `svelte-dnd-action`? | Native works in all custom-element contexts (including iframes). `svelte-dnd-action` has better DX but is Svelte-only and may have iframe edge cases. Recommendation: native. |
| O4 | **Tables**: do you need full parity with the existing Obsidian-style edge controls and row drag, or is basic toolbar-driven editing acceptable for v1? | `@lexical/table` ships insert/delete row/col, merge/unmerge, column reorder, Tab/arrow nav, and cell selection. Markdown round-trip is a custom transformer (~120 lines, demonstrated at commit `d5c5af3`). The remaining custom work is edge-hover control rendering and row-drag handlers. Days, not weeks. |
| O5 | **List edge cases**: how much of the 700-line `list-commands.ts` logic is actually needed? | Audit which behaviors are user-visible vs. defensive. Many were bug fixes for specific reproductions; some may not occur in Lexical at all. |
| O6 | **Card model**: is the card structure expressible in markdown round-trippable form, or does it require a JSON sidecar? | Affects whether the document is "just markdown" or "markdown + manifest". Strongly prefer the former for portability. |
| O7 | **Schema form**: where does field validation live — in `core` (portable) or only in the UI? | Recommendation: schema interpretation and validation in `core`; UI renders and binds. |
| O8 | **Versioning relative to tonguetoquill-web**: lockstep, or independent SemVer? | Recommendation: independent SemVer; tonguetoquill-web pins. |
| O9 | **Repo layout**: monorepo inside tonguetoquill-web (`packages/editor`), or separate repo? | Recommendation: pnpm monorepo in-place to start; promote to its own repo when external contributors arrive. |

---

## 7. Constraints & risks

- **Svelte 5 custom-element compiler maturity.** `customElement: true` is
  officially supported but less battle-tested than the component output.
  Complex object props and event payload typing across the WC boundary need
  explicit handling. Budget ~1 week of polish on the WC layer specifically.
- **List indent/outdent edge cases.** Lexical's defaults do not match the
  tonguetoquill-web behavior in all cases. Audit before assuming parity.
- **Tables.** `@lexical/table` is framework-agnostic (verified in the tables
  spike at commit `d5c5af3`). Built-in operations cover most of the existing
  `table-commands.ts` surface. Custom work remaining: markdown transformer
  (~120 lines, sample preserved at the cited commit), Obsidian-style edge-hover
  control rendering, and row-drag handlers. See O4.
- **iOS native formatting interception.** The current `BodyEditor` intercepts
  `beforeinput` with `inputType: 'formatBold'` etc. to keep iOS context-menu
  formatting in sync with editor state. Lexical's command system needs an
  equivalent — verify on a real iOS device, not just the simulator.
- **`__text__` semantic conflict.** QuillMark uses `__text__` for underline
  (Word convention); markdown convention is bold. The spike replaces
  `BOLD_UNDERSCORE` with an `UNDERLINE_UNDERSCORE` transformer. Documents
  that previously contained bold via underscores will be re-serialized as
  bold via asterisks (functionally equivalent, but a visible diff in source).
  Coordinate with the QuillMark canon if needed.
- **iframe edge cases for ChatGPT / MCP Apps.** Clipboard, drag-out-of-iframe,
  file upload, focus restoration after host modal interactions all need
  manual verification.
- **Bundle size discipline.** A future contributor adding `@lexical/yjs` or a
  large highlighter package will silently erode the bundle win. Add a CI check
  on `dist/element.js` size with a fail threshold.

---

## 8. References

- Spike commits (reset off branch, recoverable via reflog):
  - `459ae55` — BodyEditor + custom transformers (`LexicalBodyEditor.svelte`,
    `InlineMetadataNode.ts`, `transformers.ts`, `/lexical-spike` route).
  - `d5c5af3` — Tables (`tableTransformer.ts`, `/lexical-tables-spike` route).
- ProseMirror surface to migrate from: `src/lib/components/Editor/BodyEditor.svelte`,
  `src/lib/editor/prosemirror/`.
- Lexical: [lexical.dev](https://lexical.dev/), [lexical.dev/docs/packages/lexical-markdown](https://lexical.dev/docs/packages/lexical-markdown).
- ChatGPT Apps SDK: [developers.openai.com/apps-sdk](https://developers.openai.com/apps-sdk).
- MCP Apps standard: [blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/).