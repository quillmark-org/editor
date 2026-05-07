# Visual Editor Design

**Purpose**: Define the architecture for the VisualEditor WYSIWYG editing mode using ProseMirror, with the existing CodeMirror editor preserved as "Advanced Mode".

**Cross-references**:
- Wizard integration: [WIZARD_SYSTEM.md](WIZARD_SYSTEM.md)
- Wizard dirty tracking: [WIZARD_DIRTY_TRACKING.md](WIZARD_DIRTY_TRACKING.md)
- Placeholders & fillable content: [MD_PLACEHOLDERS.md](MD_PLACEHOLDERS.md)
- Keyboard shortcuts: [HOTKEYS.md](HOTKEYS.md)
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- State patterns: [STATE_PATTERNS.md](STATE_PATTERNS.md)

## Overview

The Visual Editor provides WYSIWYG editing that hides markdown complexity while preserving full compatibility with the existing markdown document format. Supports switching between Visual Mode and Advanced Mode (markdown editing).

## Architecture: EditorState Pattern (2.0)

> **Status**: Implemented in current editor stack.

### Core Concepts

1. **Inverted Source of Truth**: The `EditorStateStore` IS the document during editing. We do *not* round-trip through the string parser on every keystroke.
2. **Persistent Identity**: Card IDs are stable. They are not derived solely from connection order.
3. **Smart Reconciliation**: When parsing is necessary (e.g. initial load or pasted text), we reconcile new state with existing state to preserve object identity.

### Implementation

- `src/lib/editor/editorState.svelte.ts` — EditorState interfaces, EditorStateStore class
- `src/lib/parsing/yaml-document.ts` — Unified YAML update operations

### Centralized Typed State

```typescript
interface EditorState {
  quillName: string;
  frontmatter: Record<string, unknown>;  // Parsed object
  frontmatterRaw: string;                 // Raw YAML with comments
  primaryBody: string;                    // Markdown
  cards: CardState[];

  // Field-level dirty tracking
  dirtyFrontmatterFields: Set<string>;
  dirtyCardFields: Map<string, Set<string>>;
}

interface CardState {
  id: string; // Stable UUID
  type: string;
  metadata: Record<string, unknown>;
  metadataRaw: string;  // Raw YAML preserves comments
  body: string;
}
```

### EditorStateStore API

- `initFromDocument(document, quillName)` — Parse document string to state
- `toDocumentString()` — Serialize state back to document
- `addCard(index, id?)` — Add new card at position
- `removeCard(cardId)` — Delete a card
- `moveCard(cardId, direction)` — Move card up/down
- `updateCardType(cardId, newType)` — Change card type
- `updateCardMetadata(cardId, raw, parsed)` — Update card YAML
- `updateCardBody(cardId, body)` — Update card markdown
- `markCardFieldDirty(cardId, field)` — Track field modifications

### Data Flow

```
Init: String -> Parse -> Store (Golden Record) -> VisualEditor Components
Edit: Components -> Mutate Store -> serialization (Async/Debounced) -> emit "change"
```

## Document Architecture

### Separation of Concerns

```
┌─────────────────────────────────────────────┐
│           YAML FRONT MATTER                 │
│  (Managed externally via Wizard/YAML utils) │
│                                             │
│  ---                                        │
│  QUILL: usaf_memo                           │
│  title: Document Title                      │
│  ---                                        │
├─────────────────────────────────────────────┤
│           MARKDOWN BODY                     │
│  (Managed by ProseMirror in rich text mode) │
│                                             │
│  # Heading                                  │
│  Body paragraph with **bold** text.         │
│  {:placeholder:}                            │
└─────────────────────────────────────────────┘
```

### Content Flow

```
                    ┌──────────────────┐
                    │  Full Document   │
                    │  (markdown str)  │
                    └────────┬─────────┘
                             │
               ┌─────────────┴─────────────┐
               ▼                           ▼
    ┌───────────────────┐       ┌───────────────────┐
    │  YAML Front Matter│       │   Markdown Body   │
    └─────────┬─────────┘       └─────────┬─────────┘
              │                           │
              ▼                           ▼
    ┌───────────────────┐       ┌───────────────────┐
    │  MetadataWidget   │       │  ProseMirror      │
    │  (schema-based)   │       │  (rich text)      │
    └─────────┬─────────┘       └─────────┬─────────┘
              │                           │
              │  Auto-save changes        │  Rich text edits
              ▼                           ▼
    ┌───────────────────┐       ┌───────────────────┐
    │ updateYamlDocument│       │MarkdownSerializer │
    └─────────┬─────────┘       └─────────┬─────────┘
              │                           │
              └─────────────┬─────────────┘
                            ▼
                 ┌───────────────────┐
                 │ Merged Document   │
                 │ (full markdown)   │
                 └───────────────────┘
```

### Island-Based Parse Architecture

QuillMark documents consist of **islands**: independent content regions, each with YAML metadata and a markdown body. The VisualEditor parses and renders each island separately.

#### Document Structure

```
┌─────────────────────────────────────────────┐
│           YAML FRONTMATTER                  │
│  ---                                        │
│  QUILL: usaf_memo                           │
│  title: Document Title                      │
│  ---                                        │
├─────────────────────────────────────────────┤
│           PRIMARY BODY                      │
│  (Markdown before any inline YAML blocks)   │
├─────────────────────────────────────────────┤
│           CARD 1 (Island)                   │
│  ---                                        │
│  CARD: indorsement                          │
│  approver: Col Smith                        │
│  ---                                        │
│  Card body markdown content...              │
├─────────────────────────────────────────────┤
│           CARD 2 (Island)                   │
│  ---                                        │
│  CARD: attachment                           │
│  ---                                        │
│  Another card's body content...             │
└─────────────────────────────────────────────┘
```

#### Parsing Flow (Markdown → EditorState)

```
Markdown String
       │
       ▼
┌─────────────────────────────────────────────┐
│ parseDocumentRegions()                      │
│ Splits: frontmatter + body                  │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│ parseBodySections()                         │
│ Uses markdown-it to detect --- delimiters   │
│ Outputs: BodySection[] (primary + cards)    │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│ parseToEditorState()                        │
│ Converts sections → CardState[]             │
│ Reconciles with previous state (stable IDs) │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
              EditorState
       { frontmatter, primaryBody, cards[] }
```

#### Serialization Flow (EditorState → Markdown)

```
EditorState
       │
       ▼
┌─────────────────────────────────────────────┐
│ For each island:                            │
│   1. Render YAML block from metadataRaw     │
│   2. Append body markdown                   │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│ combineBodySections()                       │
│ Concatenates all islands with proper        │
│ spacing and --- delimiters                  │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│ combineDocumentRegions()                    │
│ Prepends frontmatter to body                │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
           Markdown String
```

#### Key Implementation Files

| File | Responsibility |
|------|----------------|
| `document-utils.ts` | `parseBodySections()`, `combineBodySections()`, region utilities |
| `editorState.svelte.ts` | `parseToEditorState()`, `serializeFromEditorState()`, EditorStateStore |
| `parser.ts` | markdown-it config with custom plugins (underline, comments, inline_metadata) |
| `serializer.ts` | ProseMirror → markdown via `prosemirror-markdown` |

## Component Architecture

### Component Hierarchy

```
DocumentEditor.svelte (existing)
├── EditorModeSwitch.svelte / Settings Overlay (new)
│   └── Toggle: Rich Text ↔ Advanced Mode
├── VisualEditor.svelte (new)
│   ├── MetadataWidget.svelte (new) ─────────────────┐
│   │   ├── Collapsible header with summary          │
│   │   ├── WizardCore.svelte (new, extracted logic) │
│   │   └── SchemaForm.svelte (existing, adapted)    │
│   ├── BodyEditor.svelte (ProseMirror wrapper)      │
│   │   └── EditorToolbar.svelte (adapted)           │
│   └── AddCardTrigger.svelte (new)                  │
├── MarkdownEditor.svelte (existing, for Advanced Mode)
└── Preview.svelte (existing)
```

### New/Modified Components

| Component | Status | Description |
|-----------|--------|-------------|
| `VisualEditor.svelte` | Implemented | Main rich text editor container |
| `BodyEditor.svelte` | Implemented | Reusable ProseMirror instance |
| `MetadataWidget.svelte` | Implemented | Foldable inline metadata editor |
| `WizardCore.svelte` | Implemented | Extracted wizard logic |
| `EditorBlock.svelte` | Implemented | UI container for document sections |
| `EditorToolbar.svelte` | Adapted | Support both editor modes |
| `SchemaForm.svelte` | Adapted | Compact mode prop |

### State Management

```typescript
// In DocumentEditor.svelte

// Editor mode (persisted to localStorage)
let editorMode: 'rich' | 'advanced' = $state(
  localStorage.getItem('editor-mode') ?? 'rich'
);

// Document regions
let frontMatter: string = $state('');  // Raw YAML including delimiters
let bodyContent: string = $state('');  // Markdown body

// Derived full document for save/preview
let fullDocument = $derived(
  frontMatter ? `${frontMatter}\n${bodyContent}` : bodyContent
);
```

### Mode Switching

**Rich → Advanced:**

1. Serialize ProseMirror document to markdown
2. Update `bodyContent` with serialized markdown
3. Initialize CodeMirror with full document (front matter + body)

**Advanced → Rich:**

1. Parse full document to separate front matter and body
2. Parse body through MarkdownParser → ProseMirror document
3. Initialize ProseMirror with parsed document
4. Initialize MetadataWidget with parsed front matter and schema

## Custom ProseMirror Schema

### Base Schema Extension

| Node/Mark | Type | Description |
|-----------|------|-------------|
| `placeholder` | Inline node | Represents `{:...:}` syntax as atomic, clickable element |
| `underline` | Mark | Represents `__text__` underline syntax |

### Placeholder Node

```ts
placeholder: {
  group: "inline",
  inline: true,
  atom: true,  // Cannot be edited directly
  attrs: {
    content: { default: "" }
  },
  toDOM: (node) => ["span", { class: "pm-placeholder" }, node.attrs.content || ""]
}
```

- Uses `createPlaceholderDecorationPlugin` instead of a NodeView
- Decorations render the `{:`, content, and `:}` span structure
- Clicking a placeholder selects the entire range (handled by `BodyEditor.selectPlaceholder`)
- Typing replaces the selection (standard editor behavior)

### Underline Mark

QuillMark uses `__text__` for underline (non-standard markdown):

```ts
underline: {
  parseDOM: [{ tag: "u" }, { style: "text-decoration=underline" }],
  toDOM: () => ["u", 0]
}
```

## Toolbar Adaptation

### Toolbar Actions Mapping

| Action | CodeMirror | ProseMirror |
|--------|------------|-------------|
| Bold | Wrap with `**` | Toggle `strong` mark |
| Italic | Wrap with `*` | Toggle `em` mark |
| Underline | Wrap with `__` | Toggle `underline` mark |
| Strikethrough | Wrap with `~~` | Toggle `strikethrough` mark |
| Code | Wrap with `` ` `` | Toggle `code` mark |
| Quote | Prepend `>` | Wrap in `blockquote` node |
| Bullet list | Toggle `-` marker | Toggle `bullet_list` |
| Numbered list | Prepend `1.` | Toggle `ordered_list` |
| Link | Wrap `[]()` | Insert/edit `link` mark |
| Toggle frontmatter | Fold/unfold | Hidden (use MetadataWidget) |

### Input Rules

| Trigger | Result |
|---------|--------|
| `**text**` | Converts to bold text |
| `*text*` | Converts to italic text |
| `__text__` | Converts to underline text |
| `# ` at line start | Converts to heading 1 |
| `## ` at line start | Converts to heading 2 |
| `- ` or `* ` at line start | Converts to bullet list item |
| `1. ` at line start | Converts to numbered list item |
| `> ` at line start | Converts to blockquote |
| ` ``` ` at line start | Converts to code block |
