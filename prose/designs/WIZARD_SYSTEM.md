# Wizard System Design

**Cross-references**:
- Dirty field tracking: [WIZARD_DIRTY_TRACKING.md](WIZARD_DIRTY_TRACKING.md)
- Placeholders & fill semantics: [MD_PLACEHOLDERS.md](MD_PLACEHOLDERS.md)
- Rich text editor integration: [VISUAL_EDITOR.md](VISUAL_EDITOR.md)
- Keyboard shortcuts: [HOTKEYS.md](HOTKEYS.md)

## Overview

The Wizard system allows users to edit document metadata (frontmatter) through a graphical interface generated from the Quill's JSON schema. The system is delivered through an **embedded metadata widget** (Visual Editor) with auto-save behavior and shared `WizardCore` logic.

## Architecture

### Component Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    WizardCore.svelte                        │
│  Shared logic:                                              │
│  • Data initialization from document                        │
│  • Dirty field tracking (Set<string>)                       │
│  • Debounced change propagation                             │
│  • YAML update coordination                                 │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
┌───────────────────┐         ┌─────────────────────┐
│ MetadataWidget.svelte │
│ (embedded consumer)   │
├───────────────────────┤
│ • Foldable panel      │
│ • Expand/collapse     │
│ • Auto-save behavior  │
│ • Compact layout      │
└─────────────┬─────────┘
              ▼
     ┌───────────────────┐
     │ SchemaForm.svelte │
     │ (form rendering)  │
     └───────────────────┘
```

### Components

1. **WizardCore**
   - **Role**: Shared logic layer for wizard state management.
   - **Responsibility**: Data cloning and initialization from parsed YAML; `dirtyFields` Set management; `onFieldDirty()` callback handling; debounced `onFormChange` emission for live preview; integration with `updateYamlDocument()`.
   - **Interface**:
     ```typescript
     interface WizardCoreProps {
       document: string;                    // Full markdown document
       schema: JSONSchema;                  // From quillmarkService
       onDocumentChange: (doc: string) => void;
       debounceMs?: number;                 // Default: 50ms
     }
     ```

2. **MetadataWidget**
   - **Role**: Embedded foldable widget for wizard interface (Visual Editor mode).
   - **Responsibility**: Collapsible header with summary (template name, field completion count); expand/collapse animation; auto-save on field blur with debounce.
   - **Interface**:
     ```typescript
     interface MetadataWidgetProps {
       document: string;
       schema: JSONSchema;
       quillName: string;                   // For display in header
       onDocumentChange: (doc: string) => void;
       expanded?: boolean;
       onExpandedChange?: (expanded: boolean) => void;
     }
     ```

3. **SchemaForm**
   - **Role**: Renders the form based on JSON schema.
   - **Responsibility**: Iterates schema properties; renders field components by type and UI metadata; manages form state and validation; handles nested objects and arrays; supports compact mode.

4. **Field Components**
   - **Role**: Specialized components for different data types.
   - **Types**: `StringField`, `NumberField`, `BooleanField`, `ArrayField`, `EnumField`, `DateField`.

### Data Flow

1. **Initialization**: User expands the metadata panel; `DocumentEditor` retrieves document content and active Quill ID; `QuillmarkService.getQuillInfo(quillId)` fetches schema; current frontmatter is parsed.
2. **Form Rendering**: `MetadataWidget` initializes `SchemaForm` with schema and frontmatter; `SchemaForm` generates UI with existing data or defaults.
3. **User Interaction**: User modifies fields; `SchemaForm` updates internal state.
4. **Submission**: Field edits captured continuously by `WizardCore` and propagated through `MetadataWidget`; data converted to YAML frontmatter; `DocumentEditor` updates document content.

## Integration Points

- **QuillmarkService**: Exposes `getQuillInfo` for schema access.
- **DocumentEditor / VisualEditor**: Host `MetadataWidget` and manage data exchange.
- **VisualEditor**: Hosts `MetadataWidget` inline above content area.

---

## MetadataWidget Design

### Embedded Foldable Widget

**Collapsed State:**

```
┌────────────────────────────────────────────────────────────┐
│  ▶ Document Metadata          USAF Memo  •  3/5 fields  ▾  │
└────────────────────────────────────────────────────────────┘
```

**Expanded State:**

```
┌────────────────────────────────────────────────────────────┐
│  ▼ Document Metadata          USAF Memo  •  3/5 fields  ▴  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─ General ─────────────────────────────────────────────┐ │
│  │  Title     [Document Title________________]           │ │
│  │  Author    [John Doe______________________]           │ │
│  │  Date      [2025-01-15____________________]           │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌─ Stationery ──────────────────────────────────────────┐ │
│  │  Letterhead  [✓]                                      │ │
│  │  Logo        [Upload...]                              │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Widget Properties

| Property | Description |
|----------|-------------|
| **Position** | Fixed at top of editor, above content area |
| **Collapse toggle** | Click header or chevron to expand/collapse |
| **Summary display** | Template name + field completion count always visible |
| **Scroll behavior** | Widget scrolls with document; consider sticky header option |
| **Height limit** | Max height with internal scroll when expanded (e.g., 50vh) |
| **Animation** | Smooth slide transition (matching existing `slide` usage) |
| **Auto-save** | Changes apply immediately with debounce (no Save/Cancel buttons) |
| **Keyboard** | Ctrl/Cmd+E toggles expand/collapse |

### Save Behavior Comparison

| Behavior | MetadataWidget |
|----------|----------------|
| When saved | Automatic on field blur + debounce |
| Cancel option | No cancel; undo via Ctrl+Z |
| Dirty tracking | Tracks for auto-save throttling |
| Preview update | Debounced while editing |
| Document update | On debounce timer (50ms) |

### Collapsed Header Information

| Element | Source | Example |
|---------|--------|---------|
| Template name | `QUILL` field value | "USAF Memo" |
| Completion indicator | Required fields filled / total | "3/5 fields" |
| Dirty indicator | Any uncommitted changes | "•" dot or subtle highlight |
| Expand affordance | Chevron icon | ▶ / ▼ |

### Edge Cases

1. **No schema available**: Show collapsed header with "No template selected" message
2. **Schema loading**: Show skeleton/loading state in expanded view
3. **Validation errors**: Highlight invalid fields; don't block collapse
4. **Very long forms**: Internal scroll within max-height container
5. **Narrow viewport**: Consider full-width layout, stacked groups
