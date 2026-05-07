# Wizard Dirty Field Tracking

Tracks form field modifications in WizardCore for selective YAML frontmatter updates and real-time preview rendering.

**Status**: Dirty Tracking implemented; Live Preview implemented

**Cross-references**:
- Implementation: `src/lib/components/Wizard/WizardCore.svelte`
- Architecture: See `ARCHITECTURE.md` for component patterns
- State patterns: See `STATE_PATTERNS.md` for form state guidance

## Dirty Tracking Model

A field is "dirty" when its current value differs from its initial value at form open. Initial value = value from parsed YAML (or `undefined` if absent). Dirty fields get written to YAML; clean fields preserve whatever existed in original YAML.

**Empty Field Rules**:

| Scenario                    | Field State       | Action                                |
| --------------------------- | ----------------- | ------------------------------------- |
| User never touched field    | Clean             | Preserve original (or omit if absent) |
| User typed then cleared     | Dirty + empty     | Remove from YAML                      |
| User explicitly set value   | Dirty + has value | Write to YAML                         |
| Field was empty in original | Clean + empty     | Preserve empty (no change)            |

## Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ Parsed YAML │ ──▶ │ WizardCore  │ ──▶ │ handleWizardSave│
│ (original)  │     │ (form state) │     │ (merge logic)   │
└─────────────┘     └──────────────┘     └─────────────────┘
       │                   │                      │
       │                   ▼                      │
       │           ┌──────────────┐               │
       │           │ Dirty Set    │               │
       │           │ {field names}│               │
       │           └──────────────┘               │
       │                   │                      │
       │                   ▼                      ▼
       └──────────▶ Merge: dirty fields + original non-schema fields
```

## Component Responsibilities

### WizardCore

- Store original data snapshot on open (deep copy)
- Track set of dirty field names
- Pass dirty set alongside form data to `onSave`

```typescript
interface WizardSavePayload {
	formData: Record<string, any>;
	dirtyFields: Set<string>;
	originalData: Record<string, any>;
}
```

### SchemaForm

- Accept dirty tracking callback from parent
- Mark fields dirty on any value change

### Field Components

- Call `onDirty(fieldName)` on first value change
- Single responsibility: input rendering + dirty notification

### DocumentEditor.handleWizardSave

- Parse original YAML frontmatter
- For each dirty field: apply new value (or delete if empty)
- Preserve all non-dirty fields from original
- Preserve non-schema fields (custom metadata)
- Maintain QUILL tag at top of output

## Merge Algorithm

**Input**:
- `originalYaml`: Parsed YAML object from document
- `formData`: Current form values
- `dirtyFields`: Set of field names user modified
- `schema`: JSON schema (for type awareness)

**Output**: Merged YAML object ready for serialization

**Algorithm**:

```
1. Start with copy of originalYaml
2. For each field in dirtyFields:
   a. Get value from formData
   b. If isEmpty(value):
      - Delete field from output
   c. Else:
      - Set output[field] = value
3. Ensure QUILL tag remains at position 0
4. Return output
```

**Empty Value Definition**:
- String: `''` or whitespace-only
- Array: `[]` or array of only empty strings
- Number: `null` or `undefined` (not `0`)
- Boolean: Never considered empty

## Utility Functions

Extracted to `src/lib/parsing/yaml-merge.ts`:

**`isEmptyValue(value: unknown, type: string): boolean`**
- Type-aware (arrays vs strings vs booleans)

**`mergeYamlWithDirtyFields(options: MergeOptions): Record<string, any>`**
- Pure function, no side effects; returns new object

**`deepEqual(a: unknown, b: unknown): boolean`**
- Handles arrays, objects, primitives

## Edge Cases

### Array Field Modifications

Adding, removing, reordering, or modifying item content: dirty.

### Type Coercion

- Schema says array, YAML has string: normalize before comparison
- Schema says number, form has string: convert for comparison

### Missing Schema Properties

- Field in YAML but not in schema: preserved unchanged
- Non-schema fields cannot be modified via wizard

### QUILL Tag Handling

- Never tracked as dirty
- Always preserved from original or current document
- Always serializes first in output YAML

---

## Live Preview (Dirty Copy)

When metadata editing is active, form edits don't reflect in the Preview until submission. The live preview feature renders from a temporary "dirty copy" of the document updated in real-time as the user edits form fields.

### Desired Behavior

**While wizard is open**: Preview renders from `dirtyContent`; form changes apply in real-time (50ms debounce).

**On wizard close/cancel**: Dirty copy discarded; Preview returns to actual document content.

**On wizard submit**: Changes applied to actual document; dirty copy no longer needed.

### Data Flow

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ DocumentEditor                                                               │
│                                                                              │
│  ┌─────────────┐    ┌─────────────────┐    ┌───────────────────────────────┐ │
│  │ content     │───▶│ debouncedContent│───▶│ previewContent ($derived)     │ │
│  │ ($state)    │    │ ($state)        │    │ = showWizard ? dirtyContent   │ │
│  └─────────────┘    └─────────────────┘    │ : debouncedContent            │ │
│                                            └───────────────────────────────┘ │
│                                                          │                   │
│  ┌─────────────┐                                         │                   │
│  │ dirtyContent│────────────────────────────────────────▶│                   │
│  │ ($state)    │                                         │                   │
│  └─────────────┘                                         ▼                   │
│        ▲                                        ┌───────────────┐            │
│        │                                        │ Preview       │            │
│  ┌─────────────┐                                │ markdown=     │            │
│  │ WizardCore │                                │ previewContent│            │
│  │ onFormChange│                                └───────────────┘            │
│  └─────────────┘                                                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

#### DocumentEditor

**Existing State**:
- `content: $state<string>('')` — actual document content
- `debouncedContent: $state<string>('')` — content for preview rendering
- `showWizard: $state<boolean>(false)` — whether wizard modal is open

**New State**:
- `dirtyContent: $state<string>('')` — temporary document with form changes applied

**New Derived**:
- `previewContent: $derived(showWizard ? dirtyContent : debouncedContent)`

**New Callback**: `handleWizardFormChange(formData)` — rebuilds dirty copy when form changes

**Behavior**:
- On wizard open: initialize `dirtyContent` from `content`
- On wizard close/cancel: `dirtyContent` naturally ignored (`showWizard = false`)
- Preview receives `previewContent` instead of `debouncedContent`

#### WizardCore

**New Prop**: `onFormChange?: (formData: Record<string, any>) => void`

**Behavior**: Call `onFormChange` whenever `formData` changes (50ms debounce).

#### Preview

No changes. Receives `previewContent` prop; unaware of dirty copy mechanism.

### Dirty Content Generation

```text
1. Get current formData from wizard
2. Apply mergeYamlWithDirtyFields to generate merged YAML object
3. Serialize to YAML and replace frontmatter in dirtyContent
```

Reuses `mergeYamlWithDirtyFields` utility.

### Edge Cases

**Rapid Form Edits**: WizardCore debounces `onFormChange` (50ms); prevents excessive dirty content rebuilds.

**Wizard Opens with Errors**: Dirty copy starts with same errors; no special handling needed.

**Large Documents**: YAML merge is O(1) object operations; string replacement is O(n) copy. No concern for typical documents (<100KB).

**Multiple Wizard Opens/Closes**: Each open initializes fresh `dirtyContent` from `content`; no stale state.

### Implementation Approach

1. Add `dirtyContent` state to DocumentEditor
2. Add `previewContent` derived state to DocumentEditor
3. Add `onFormChange` prop to WizardCore
4. Add debounced `$effect` in WizardCore to call `onFormChange` on formData changes (50ms)
5. Wire `handleWizardFormChange` in DocumentEditor to rebuild dirty copy
6. Change Preview prop from `debouncedContent` to `previewContent`

**Line Count**: DocumentEditor +15–20 lines; WizardCore +10–15 lines. No changes to Preview, SchemaForm, or field components.
