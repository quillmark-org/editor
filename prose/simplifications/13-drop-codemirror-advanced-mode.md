# 13 — Drop the CodeMirror "Advanced" editor entirely

## Why it matters

This is the largest single cascade in the repo. The `Advanced` (CodeMirror) mode is one of two editors users can toggle between. Eliminating it removes ~4,100 lines of code — about a third of `src/lib` — and cascades into:

- the entire `editor/codemirror/` subdirectory (1064 lines patterns + 791 lines tests + 636 lines decorator + 288 lines keybindings + 214 lines theme + 187 lines fold utils + 117 lines placeholder handler + 147 lines folding/tests + barrel)
- the `editor/shared/placeholder-patterns.ts` regex (only used by codemirror)
- `MarkdownEditor.svelte` (464 lines)
- `EditorModeSwitch.svelte` (58 lines)
- `utils/editor-theme.ts` (60 lines)
- `parsing/patterns.ts` (last codemirror dep) — combined with #02, the `parsing/` directory disappears
- the `mode` / `onModeChange` props on `DocumentEditor` and the `{#if mode === 'rich'}` branch
- the `@codemirror/*` runtime dependencies (5 packages: `@codemirror/commands`, `@codemirror/lang-markdown`, `@codemirror/language`, `@codemirror/state`, `@codemirror/view`)

The codebase becomes "Lexical visual editor + Preview" — a single source of truth for rich editing.

This is a feature deletion that needs product buy-in. The proposal documents the case; the decision is yours.

## Evidence — what Advanced mode currently provides

The CodeMirror layer reimplements YAML/markdown syntax highlighting from scratch because CodeMirror doesn't natively understand Quillmark frontmatter:

- **`quillmark-patterns.ts` (1064 lines)** parses metadata blocks, CARD/QUILL keywords, YAML key-value pairs, YAML tagged arrays (`!fill`), YAML comments, markdown bold/italic/underline/links/comments/placeholders. Tests in `quillmark-patterns.test.ts` (791 lines).
- **`quillmark-decorator.ts` (636 lines)** applies decorations from those patterns: line backgrounds for metadata blocks, foldable widget for `---` delimiters, color marks for keys/values/booleans/numbers/comments/tags/placeholders.
- **`quillmark-folding.ts` + fold utilities (~330 lines)** drive code-folding for metadata blocks.
- **`editor-keybindings.ts` (288 lines)** provides list continuation on Enter, Tab/Shift-Tab indent, Mod-B/I/U format shortcuts, Mod-. frontmatter toggle.
- **`placeholder-handler.ts` (117 lines)** detects clicks on `{:placeholder:}` decorations and selects them.
- **`quillmark-theme.ts` (214 lines)** styles every decoration class.

The Lexical (Rich) editor handles the same content — markdown and frontmatter — without any of this. Frontmatter is parsed by wasm; the body is fed to Lexical which handles markdown shortcuts natively.

## What "raw text" users actually need

If the goal of Advanced mode is "see and edit the raw markdown source", consider:

1. **A 30-line `<textarea>` mode.** Bind `markdown` directly to a `<textarea>`. No syntax highlighting, no folding — but the user can see and edit the exact source. This is functionally equivalent to "what most apps mean by view-source".

2. **Read-only source preview.** A side panel showing the raw markdown the editor would emit, no editing. Even simpler.

3. **No raw mode.** Everything goes through the visual editor. Power users can paste raw markdown into a body field and Lexical will parse it.

Each option is dramatically simpler than the current implementation.

## What to delete

- `src/lib/editor/codemirror/` (whole directory)
- `src/lib/editor/shared/placeholder-patterns.ts`
- `src/lib/components/MarkdownEditor.svelte`
- `src/lib/components/EditorModeSwitch.svelte`
- `src/lib/utils/editor-theme.ts`
- `src/lib/parsing/patterns.ts` (combined with #02, the whole `parsing/` dir is gone)
- The `mode` / `onModeChange` / `setMode` plumbing in `DocumentEditor.svelte` (lines 15, 31, 39, 50, 147-151, 185-189, 192-210)
- The `{#if mode === 'rich'} … {:else} <MarkdownEditor … /> {/if}` branch in `DocumentEditor.svelte:192-210` collapses to just the visual editor branch
- `EditorMode` type in `lib/types.ts` (and its export from `lib/index.ts`)
- `@codemirror/*` packages from `package.json`

## What to add

If you want option 1 (textarea fallback): roughly 40 lines of a `RawMarkdownEditor.svelte` component with a debounced `oninput` handler. Replace `MarkdownEditor` references with this.

## Risk / verification

- **The big risk is user expectation**: power users who currently rely on Advanced mode will lose it. Audit usage if telemetry is available.
- After deletion, the bundled JS shrinks substantially (`@codemirror/*` is heavy).
- The visual editor in Rich mode handles all current content; no functionality is lost beyond "view raw with syntax highlighting".

## Cascade

- ~4,100 lines removed.
- 5 npm packages removed.
- `parsing/` subdirectory disappears (combined with #02).
- Proposals #03, #10, #11 become moot (they are CodeMirror-internal cleanups).
- Mental model collapses: one editor, one parser, one theme.
