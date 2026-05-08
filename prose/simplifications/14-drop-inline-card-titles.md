# 14 — Drop inline-editable card titles (`PRESENTATION.name`)

## Why it matters

Cards already have a `tag` (e.g. `signature_card`, `recipient_card`) which is informative and rendered via `formatCardLabel` ("Recipient Card"). On top of that, the editor lets users override the displayed name via a hidden frontmatter field `PRESENTATION.name`, edited via an inline-editable title in the card header.

This adds:

- a 155-line `inline-editable-title.svelte` component with sizer span, input span, focus management
- ~30 lines of `getCardName` / `handleCardNameChange` / `formatCardLabel` plumbing in `VisualEditor.svelte`
- ~25 lines of edit-mode state and `onLabelChange` plumbing in `EditorBlock.svelte`
- a `PRESENTATION.name` reserved frontmatter convention that the wasm engine has to understand, ignore, or render

The display value adds little — cards are positionally identified, the tag-based label is descriptive, and "I want to call this signature_card 'Approved by Capt Smith'" is rare. If the rendered output template doesn't actually consume `PRESENTATION.name`, the field is purely UI ornamentation.

## Evidence

`src/lib/components/VisualEditor.svelte:28-41`:

```ts
function getCardName(card: CardView): string {
    const presentation = card.frontmatter?.PRESENTATION as Record<string, unknown> | undefined;
    if (presentation?.name && typeof presentation.name === 'string') {
        return presentation.name;
    }
    return formatCardLabel(card.tag);
}

function handleCardNameChange(index: number, newName: string) {
    const card = editorStore.getCard(index);
    const presentation = (card?.frontmatter?.PRESENTATION as Record<string, unknown>) ?? {};
    editorStore.setCardField(index, 'PRESENTATION', { ...presentation, name: newName });
    emitDocumentChange();
}
```

`src/lib/components/EditorBlock.svelte:46-93`: the editable header logic, including `isEditingLabel` state, the click-to-edit `<span role="button">`, and the `<InlineEditableTitle … />` import.

`src/lib/ui/inline-editable-title.svelte` (155 lines).

`src/lib/components/VisualEditor.svelte:353` passes `onLabelChange={(newName) => handleCardNameChange(index, newName)}` to `EditorBlock`.

## What to delete

- `src/lib/ui/inline-editable-title.svelte` (155 lines)
- `getCardName`, `handleCardNameChange`, `formatCardLabel` in `VisualEditor.svelte` (~30 lines)
- `onLabelChange`, `isEditingLabel`, the editable `<span>` branch in `EditorBlock.svelte` (~25 lines)
- The `label={getCardName(card)}` prop reduces to `label={formatCardLabel(card.tag)}` — and even `formatCardLabel` can collapse into a 1-liner

After cuts, the card header just shows `formatCardLabel(card.tag)` — non-editable. The `PRESENTATION` field convention can stay in the schema if downstream templates consume it, but the editor stops touching it.

## Risk / verification

- Check whether any bundled Quillmark template renders `PRESENTATION.name`. If yes, the data path through frontmatter still works (the field would be set via the wizard form rather than the inline title); if no, the field is pure UI ornamentation and can be ignored.
- Smoke test the visual editor: cards still have headers, still get the right tag-derived names, still support move/delete buttons.

## Cascade

- ~210 lines removed.
- Removes one custom component (`InlineEditableTitle`) and its sizer-grid CSS.
- Eliminates an undocumented frontmatter convention (`PRESENTATION.name`).
- Card UX simplifies: the tag is the name; renaming happens via the schema if at all.
