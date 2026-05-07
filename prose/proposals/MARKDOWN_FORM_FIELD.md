# Markdown Form Field

**Purpose**: Surface the ProseMirror markdown editor inside `SchemaForm` for frontmatter fields declared `type: markdown`.

**Status**: Proposed  
**Related**: `SchemaForm.svelte`, `BodyEditor.svelte`, `StringField.svelte`

---

## Problem

`SchemaForm` renders all `string` schema fields as a single-line `<Input>`. Fields declared `type: markdown` (serialised as `contentMediaType: "text/markdown"` in JSON Schema) need the same rich editing experience as the body editor: inline formatting, lists, placeholder decorations. There is no path for that today.

A parallel markdown editor would duplicate the parsing/serialising pipeline and the selection toolbar — the same bugs would need fixing in two places.

## Decisions

**Reuse `BodyEditor` directly.** It already owns the ProseMirror instance, `parseMarkdown`/`serializeMarkdown`, `SelectionToolbar`, and placeholder-related editor behavior. A thin wrapper is all that's needed.

**Detection via `contentMediaType`.** Check `prop.contentMediaType === 'text/markdown'` in `getFieldComponent()` before the type switch. No new `x-ui` keys required for the core feature.

**`x-ui.multiline` controls initial height only.** It is a presentation hint; the editor is always fully functional regardless of this flag. Default height ~120 px; `multiline: true` opens at ~240 px. Both scroll rather than grow unbounded.

**No table controls in form context.** `TableControls` (the hover-zone addon) is omitted — form fields are too narrow and the use-case doesn't warrant it. The selection toolbar remains.

## Design

### New file: `src/lib/components/Wizard/fields/MarkdownField.svelte`

Wraps `BodyEditor` in the standard form-field shell:

```
MarkdownField
  ├── FieldHeader          (label, description, required marker)
  └── BodyEditor           (content=value, onChange → value + onDirty())
```

Props mirror the other field components (`value`, `label`, `description`, `required`, `placeholder`, `onDirty`). Add one extra:

- `multiline?: boolean` — passed from `prop['x-ui']?.multiline`; sets a CSS custom property `--md-field-min-height` on the wrapper (`120px` default, `240px` when true).

Bridge the two contracts:

- `BodyEditor.content` ← initial `value`
- `BodyEditor.onChange` → update `value` binding + call `onDirty()`

### Change: `src/lib/components/Wizard/SchemaForm.svelte`

1. Import `MarkdownField`.
2. In `getFieldComponent()` (line 265), insert before the `switch`:
   ```typescript
   if (prop.contentMediaType === 'text/markdown') return MarkdownField;
   ```
3. In the `renderField` snippet, forward `multiline={prop['x-ui']?.multiline ?? false}` when the component is `MarkdownField`. The existing spread pattern already handles this cleanly with a conditional spread.

No other files need to change.

## Scope

**In scope**
- `MarkdownField.svelte` — new component
- `SchemaForm.svelte` — detection + import + multiline prop forwarding

**Out of scope**
- YAML schema parsing changes (`type: markdown` → `contentMediaType` conversion happens elsewhere)
- `hide_body` / metadata-only Quill support (separate concern)
- Table controls inside form fields
