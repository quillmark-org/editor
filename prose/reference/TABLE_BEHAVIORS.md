# Table Controls Design

**Purpose**: Define the complete behavioral specification for Obsidian-style table controls in the ProseMirror rich text editor. This document captures desired behaviors, catalogues bugs from the first implementation attempt with root-cause analysis, and provides a greenfield spec for the rewrite.

**Cross-references**:

- Visual editor: [VISUAL_EDITOR.md](VISUAL_EDITOR.md)
- Keyboard shortcuts: [HOTKEYS.md](HOTKEYS.md)
- Overlay system: [OVERLAY_SYSTEM.md](OVERLAY_SYSTEM.md)
- Design tokens: [DESIGN_TOKENS.md](DESIGN_TOKENS.md)
- Accessibility: [ACCESSIBILITY.md](ACCESSIBILITY.md)

---

## Overview

Tables in the rich text editor use `prosemirror-tables` for the document model, cell selection, and structural operations. The UI layer provides Obsidian-style hover controls around the table edges for adding, selecting, reordering, and deleting rows and columns — replacing the previous floating "Black Pill" toolbar.

### Reference

The target UX is Obsidian's table editor:

```
         ⠿       ⠿       ⠿          ← Column drag handles (hover above header)
      ┌────────┬────────┬────────┐
  ⠿   │  col1  │  col2  │  col3  │  ← Row drag handle (hover left)
      ├────────┼────────┼────────┤
  ⠿   │        │        │        │
      └────────┴────────┴────────┘
              [ + Add row ]          ← Add-row bar (hover below last row)
                                  │
                                 [+]  ← Add-column bar (hover right of last column)
```

### Goals

- Obsidian-style hover controls for table manipulation
- Click drag handles to select entire rows/columns
- Drag handles to reorder rows/columns
- "+" bars to append rows/columns at table edges
- Backspace deletes selected rows/columns (not just clears cells)
- Multi-cell selection draws a visible bounding box
- Visible cell borders in all themes
- Zero layout shift when controls appear/disappear

### Non-Goals

- Cell merging/splitting (not supported in markdown tables)
- Nested tables
- Table alignment controls (left/center/right per column)
- Context menus on right-click

---

## Desired Behaviors

### 1. Table Cell Borders

Cells must always have visible borders, regardless of theme.

```css
/* Border must use a concrete color, not rely on theme variables that may be transparent */
.ProseMirror th,
.ProseMirror td {
  border: 1px solid <visible-border-color>;
}
```

**Rule**: Test borders in both light and dark themes. The `hsl(var(--border))` token must resolve to a visible color against the cell background in both themes.

### 2. Add Row (Bottom Bar)

| Behavior | Detail |
|----------|--------|
| **Trigger** | Hover below the last row of the table |
| **Visual** | A thin horizontal bar spanning the table width with a centered "+" icon |
| **Action** | Click appends a new empty row **after** the last row |
| **Positioning** | Anchored to the table's bottom edge; uses the `<table>` DOM element's bounding rect |
| **No layout shift** | The bar must not push content down; use absolute/fixed positioning outside document flow |

**API note**: `addRow(tr, rect, rowIndex)` inserts a row **after** `rowIndex`. To append after the last row, pass `map.height - 1` — which inserts after the last existing row. This was confirmed correct in the first implementation, but verify it works correctly when the cursor is not inside the table (e.g., user hovered the zone from outside).

### 3. Add Column (Right Bar)

| Behavior | Detail |
|----------|--------|
| **Trigger** | Hover to the right of the last column |
| **Visual** | A thin vertical bar spanning the table height with a centered "+" icon |
| **Action** | Click appends a new empty column **after** the last column |
| **Positioning** | Anchored to the table's right edge; **NOT** the editor container's right edge |
| **No layout shift** | Must not change column widths when appearing |

**API note**: `addColumn(tr, rect, colIndex)` inserts a column **after** `colIndex`. Pass `map.width - 1` to append.

**Critical bug from v1**: The add-column bar was positioned at `tableRect.right`, but this was computed from `getBoundingClientRect()` which returns viewport-relative coordinates. When rendered inside a Portal at `document.body`, the positioning must account for `window.scrollX/Y`. The v1 code did this correctly, but the bar's hover zone extended to the right edge of the viewport rather than being tightly bound to the table.

### 4. Row Drag Handles (Left Edge)

| Behavior | Detail |
|----------|--------|
| **Trigger** | Hover to the left of the table's first column |
| **Visual** | One ⠿ icon per row, vertically centered on each row |
| **Click** | Selects the entire row (creates a `CellSelection.rowSelection`) |
| **Drag** | Reorders the row using `moveTableRow({ from, to, select: true })` |
| **Independence** | Each handle appears/hides independently — hovering one row's handle does **not** reveal all handles |

**Critical bug from v1**: All row handles appeared/disappeared together because the hover zone was a single `<div>` covering the entire left edge. The `showLeft` boolean toggled all handles at once. Fix: each handle needs its own independent hover detection, **or** the hover zone shows handles but each handle is only "active" (highlighted) on individual hover.

**Design decision**: Show all handles when the left zone is hovered (Obsidian's behavior), but only highlight the individual handle being hovered. This is acceptable UX — showing all handles gives the user spatial context.

### 5. Column Drag Handles (Top Edge)

| Behavior | Detail |
|----------|--------|
| **Trigger** | Hover above the table's header row |
| **Visual** | One ⠿ icon per column, horizontally centered on each column |
| **Click** | Selects the entire column (creates a `CellSelection.colSelection`) |
| **Drag** | Reorders the column using `moveTableColumn({ from, to, select: true })` |
| **Independence** | Same hover model as row handles |

### 6. Multi-Cell Selection Visual

When a `CellSelection` is active (multiple cells selected), the selected cells must be visually distinct:

| Visual | Detail |
|--------|--------|
| **Background** | Selected cells get a tinted background (e.g., `hsl(var(--accent) / 0.15)`) |
| **Bounding box** | A visible border/outline around the entire selection rectangle |

`prosemirror-tables` applies a `.selectedCell` CSS class to each selected cell. The current CSS only sets a background tint. Add an outline or box-shadow to create the bounding box effect.

**Approach**: Use `outline` on `.selectedCell` cells plus removing internal borders via `:where(.selectedCell + .selectedCell)` selectors, or use a ProseMirror decoration to draw a single bounding rectangle.

### 7. Delete Rows/Columns with Backspace

| Behavior | Detail |
|----------|--------|
| **Condition** | `CellSelection` where `isRowSelection()` or `isColSelection()` returns `true` |
| **Backspace** | Removes the entire row(s) or column(s) from the table structure |
| **Non-row/col selection** | If CellSelection covers arbitrary cells (not full rows/columns), Backspace should clear cell contents (default prosemirror-tables behavior) |

**Bug from v1**: `deleteSelectedRowsColumns` was positioned first in the Backspace chain but the `deleteRow`/`deleteColumn` commands from `prosemirror-tables` may have been clearing contents instead of removing structural rows. Root cause: the `tableEditing()` plugin's own key bindings may intercept Backspace before our custom keymap. Plugin order matters — `tableEditing()` is registered before `createQuillmarkKeymap()` in the plugin array.

**Fix approach**: Either:
1. Ensure our keymap plugin is registered **before** `tableEditing()` in the plugin list, or
2. Use `tableEditing({ allowTableNodeDeletion: true })` and handle deletion differently, or
3. Override the table editing plugin's Backspace handler

### 8. Keyboard Navigation

| Key | Behavior |
|-----|----------|
| `Tab` | Move to next cell (left-to-right, top-to-bottom). If in last cell, add a new row and move there |
| `Shift+Tab` | Move to previous cell |
| `Enter` | Within a cell, insert a soft break (or create a new paragraph if cell content allows blocks) |
| `Escape` | Exit table, place cursor after the table |

These are already handled by `goToNextCell` from `prosemirror-tables` and the existing keymap.

### 9. Table Creation

| Method | Behavior |
|--------|----------|
| **Pipe syntax** | Typing `\| col1 \| col2 \|` and pressing Enter converts to a table with headers pre-filled |
| **Toolbar button** | Inserts a 3×3 table (1 header row + 2 body rows) |

Both already implemented and working correctly.

---

## Architecture

### Component Hierarchy

```
BodyEditor.svelte
├── ProseMirror EditorView
│   ├── columnResizing() plugin
│   ├── tableEditing() plugin
│   └── createQuillmarkKeymap() plugin
│       └── deleteSelectedRowsColumns (Backspace chain)
└── TableControls.svelte (was TableToolbar.svelte)
    ├── AddRowBar (bottom edge)
    ├── AddColumnBar (right edge)
    ├── RowHandles (left edge)
    └── ColumnHandles (top edge)
```

### Positioning Strategy

The controls are rendered via `Portal` (at `document.body` level) to escape any `overflow: hidden` containers. All positions are computed from `getBoundingClientRect()` + `window.scrollX/Y`.

**Key constraint**: The controls must track the table's position on every scroll and resize event. Use `requestAnimationFrame` throttling to avoid layout thrash.

**Alternative considered**: Render controls as siblings of the `<table>` element inside the ProseMirror DOM (no Portal). This avoids scroll-tracking complexity but risks being clipped by overflow containers. The editor's `.prosemirror-container` does **not** currently set `overflow: hidden`, so this approach may work and is simpler. Evaluate during rewrite.

### State Flow

```
BodyEditor.dispatchTransaction()
  → isInTable(newState) ?
    → findTable(selection.$from)
    → editorView.nodeDOM(tablePos) → tableElement
    → Pass tableElement to <TableControls>

TableControls receives:
  - editorView: EditorView (for dispatching commands)
  - tableElement: HTMLElement | null (the <table> DOM node)

TableControls measures:
  - tableRect = tableElement.getBoundingClientRect()
  - rowRects = Array.from(tableElement.querySelectorAll('tr')).map(...)
  - colRects = first row cells .map(cell => cell.getBoundingClientRect())
```

### ProseMirror Commands

All table commands live in `src/lib/editor/prosemirror/table-commands.ts`:

| Command | Purpose |
|---------|---------|
| `insertTable(rows, cols)` | Insert a new table at cursor |
| `convertPipeRowToTable` | Convert `\| col \| col \|` to table on Enter |
| `addRowAtEnd` | Append row after last row |
| `addColumnAtEnd` | Append column after last column |
| `selectRow(index)` | Select entire row by index |
| `selectColumn(index)` | Select entire column by index |
| `deleteSelectedRowsColumns` | Backspace handler for row/column deletion |

External (`prosemirror-tables`):

| Function | Purpose |
|----------|---------|
| `addRow(tr, rect, rowIndex)` | Low-level: insert row after `rowIndex` |
| `addColumn(tr, rect, colIndex)` | Low-level: insert column after `colIndex` |
| `moveTableRow({ from, to })` | Reorder a row |
| `moveTableColumn({ from, to })` | Reorder a column |
| `deleteRow(state, dispatch)` | Delete selected row |
| `deleteColumn(state, dispatch)` | Delete selected column |
| `CellSelection.rowSelection($anchor, $head)` | Select entire row |
| `CellSelection.colSelection($anchor, $head)` | Select entire column |

---

## Bug Catalogue (v1 Implementation)

### Bug 1: Invisible Cell Borders

**Symptom**: Table cell borders not visible.

**Root cause**: The CSS `border: 1px solid hsl(var(--border))` relies on the `--border` CSS custom property. If this variable resolves to a color with low contrast against the cell background (especially in dark mode), borders appear invisible.

**Fix**: Audit `--border` values in both themes. Consider using a dedicated table border token or adding a fallback: `border-color: hsl(var(--border) / 0.8), color-mix(in srgb, currentColor 20%, transparent)`.

### Bug 2: Layout Jump on Hover

**Symptom**: Hovering the add-row or add-column zones causes content to shift.

**Root cause**: The hover zones or the revealed bars may have been affecting document flow. If the Portal container or the add-bar elements have non-zero height/width in flow, they push content. Additionally, toggling `{#if showBottom}` causes DOM insertion/removal which can trigger reflow if the parent has layout dependencies.

**Fix**: Ensure all control elements use `position: absolute` or `position: fixed`. The hover zone itself should always be rendered (not conditionally) — only toggle `visibility` or `opacity` of the inner bar, not its DOM presence.

### Bug 3: Add Row/Column Inserts Before Last Instead of After

**Symptom**: Clicking "+" prepends before the last row/column instead of appending after.

**Root cause**: `addRow(tr, rect, map.height - 1)` — the `addRow` function's third parameter is the row index to insert **after**. Passing `map.height - 1` (the index of the last row) should insert after it. However, the `rect` parameter was cast with `as TableRect` and may have been missing the `Rect` fields (`left`, `top`, `right`, `bottom`), causing the function to miscompute positions.

**Alternative root cause**: The `getTableInfo()` helper resolves the table from `state.selection.$from`, which requires the cursor to actually be inside the table. When the user hovers the "+" bar from outside the table (cursor is in a paragraph below), `findTable()` returns null and the operation silently fails — or worse, operates on stale state.

**Fix**: Don't rely on `state.selection` to find the table. Instead, use `editorView.posAtDOM(tableElement, 0)` to resolve the table's document position from the DOM element directly. This works regardless of cursor position.

### Bug 4: All Drag Handles Appear Together

**Symptom**: Hovering one drag handle reveals all handles for that axis.

**Root cause**: The hover detection used a single zone div for the entire left/top edge. A single `showLeft` boolean controlled all row handles.

**Fix**: Two options:
1. **Per-handle hover zones**: Each handle has its own hover detection area. More DOM elements but independent behavior.
2. **Zone reveals all, individual highlight** (Obsidian's actual behavior): The zone shows all handles at reduced opacity, and the individual handle under the cursor gets highlighted. This is the simpler and correct approach.

### Bug 5: Add-Column Bar Positioned at Editor Edge

**Symptom**: The vertical "+" bar appears at the far right of the editor instead of at the table's right edge.

**Root cause**: `tableRect.right + window.scrollX` computes correctly from `getBoundingClientRect()`. The likely issue is that `tableRect` was stale (measured once on mount but not updated), or the table's `width: auto` CSS caused the `<table>` element to fill its container when `table-layout: fixed` was set, making `tableRect.right` equal the container's right edge.

**Fix**: Remove `table-layout: fixed` (or use `table-layout: auto`) so the table only takes the width its content needs. Re-measure `tableRect` on every render cycle or DOM mutation that changes the table.

### Bug 6: Click on Drag Handle Doesn't Select Row/Column

**Symptom**: Clicking a drag handle doesn't visually select the row/column.

**Root cause**: The `startDragRow` function calls `selectRow(index)` which dispatches a `CellSelection.rowSelection`. However, `onmousedown` fires before the browser processes the click — the ProseMirror view may immediately re-dispatch a different selection on the subsequent `mouseup` or `focus` event, overriding our selection.

**Fix**: Use `onmousedown` with `e.preventDefault()` to prevent the default focus/selection behavior, then dispatch the selection. Ensure `editorView.focus()` is called **after** dispatching the selection to avoid the view resetting it.

### Bug 7: No Bounding Box on Multi-Cell Selection

**Symptom**: Selected cells get a background tint but no outline/border to show the selection boundary.

**Root cause**: CSS only includes `.selectedCell { background: hsl(var(--accent) / 0.15); }` — no outline or box-shadow.

**Fix**: Add a visible outline:
```css
.selectedCell {
  background: hsl(var(--accent) / 0.15);
  box-shadow: inset 0 0 0 2px hsl(var(--accent) / 0.5);
}
```

Or use a ProseMirror `DecorationSet` to draw a single rectangle around the selection bounds.

### Bug 8: Backspace Clears Cell Contents Instead of Deleting Row/Column

**Symptom**: Selecting a whole row/column and pressing Backspace clears cell text but doesn't remove the row/column from the table structure.

**Root cause**: Plugin order in `EditorState.create()`:
```ts
plugins: [
  columnResizing(),    // ← Registers its own key handlers
  tableEditing(),      // ← Registers Backspace handler that clears cells
  history(),
  createQuillmarkKeymap({}),  // ← Our deleteSelectedRowsColumns is here
  keymap(baseKeymap),
  ...
]
```

`tableEditing()` registers its own Backspace handler that fires **before** our keymap. Its handler clears cell contents for any `CellSelection`, which returns `true` and prevents our `deleteSelectedRowsColumns` from ever running.

**Fix**: Move `createQuillmarkKeymap({})` **before** `tableEditing()` in the plugin list, or configure `tableEditing()` to not handle Backspace (if possible), or wrap `tableEditing()`'s behavior.

---

## Implementation Plan (Greenfield)

### Phase 1: Fix Foundations

1. **Plugin ordering**: Move `createQuillmarkKeymap()` before `tableEditing()` in the plugin array
2. **Table CSS**: Fix border visibility, remove `table-layout: fixed`, add `.selectedCell` box-shadow
3. **Verify** `addRow`/`addColumn` index semantics with unit tests

### Phase 2: Rewrite TableControls Component

1. **Positioning**: Evaluate rendering controls as ProseMirror DOM siblings (no Portal) to avoid scroll-tracking. If overflow clipping is a problem, fall back to Portal with robust position tracking.
2. **Always-rendered zones**: Don't use `{#if}` to toggle add-bars. Render them always with `opacity: 0; pointer-events: none`, toggle to `opacity: 1; pointer-events: auto` on hover. Eliminates layout reflow from DOM insertion.
3. **Table resolution**: Use `editorView.posAtDOM(tableElement, 0)` instead of `state.selection.$from` to find the table, ensuring controls work regardless of cursor position.
4. **Independent handle hover**: Show all handles in the zone, highlight individually on hover.
5. **Drag preview**: During drag, show a ghost/shadow of the row/column being moved (optional, polish).

### Phase 3: Tests

1. Unit tests for all table commands (already exist — 22 tests passing)
2. Add integration tests for plugin ordering (Backspace with `CellSelection` should call `deleteRow`/`deleteColumn`)
3. Visual regression tests for border visibility, selection highlighting (if Playwright infrastructure exists)

### Phase 4: Polish

1. Touch device support (long-press to reveal handles)
2. Animation on add/remove (subtle fade)
3. Keyboard accessibility for handles (already added in v1: `role="button"`, `tabindex="0"`, `onkeydown`)

---

## CSS Specification

### Table Base Styles

```css
.ProseMirror table {
  border-collapse: collapse;
  width: auto;           /* Don't stretch to fill container */
  margin: 1em 0;
  /* NO table-layout: fixed — let columns auto-size */
}

.ProseMirror th,
.ProseMirror td {
  border: 1px solid hsl(var(--border));
  padding: 0.4em 0.6em;
  text-align: left;
  vertical-align: top;
  position: relative;    /* For column-resize-handle positioning */
  min-width: 4em;
}

.ProseMirror th {
  background: hsl(var(--muted));
  font-weight: 600;
}
```

### Selection Styles

```css
/* Individual selected cell */
.selectedCell {
  background: hsl(var(--accent) / 0.15);
  box-shadow: inset 0 0 0 2px hsl(var(--accent) / 0.5);
}

/* Column resize handle */
.column-resize-handle {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 4px;
  background: hsl(var(--accent));
  pointer-events: auto;
  cursor: col-resize;
  z-index: 20;
}
```

### Control Styles (Hover Zones)

```css
/* Invisible hover detection zone */
.table-add-zone {
  position: absolute;
  pointer-events: auto;
  /* Always rendered, never display:none */
}

/* The visible bar inside the zone */
.table-add-bar {
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

/* Reveal on zone hover */
.table-add-zone:hover .table-add-bar {
  opacity: 1;
  pointer-events: auto;
}

/* Drag handle */
.table-drag-handle {
  cursor: grab;
  user-select: none;
  opacity: 0.5;
  transition: opacity 100ms ease, background 100ms ease;
}
.table-drag-handle:hover {
  opacity: 1;
  background: hsl(var(--accent) / 0.2);
}
.table-drag-handle.dragging {
  cursor: grabbing;
  opacity: 1;
}
```

---

## File Manifest

| File | Purpose |
|------|---------|
| `src/lib/components/Editor/TableControls.svelte` | Obsidian-style hover controls (add bars, drag handles) |
| `src/lib/editor/prosemirror/table-commands.ts` | ProseMirror commands for table operations |
| `src/lib/editor/prosemirror/table-commands.test.ts` | Unit tests (26 tests) |
| `src/lib/editor/prosemirror/keymap.ts` | Backspace chain with `deleteSelectedRowsColumns`, Enter with `convertPipeRowToTable`, Tab with `goToNextCell` |
| `src/lib/editor/prosemirror/schema.ts` | Table node specs from `prosemirror-tables` |
| `src/lib/editor/prosemirror/index.ts` | Barrel exports |
| `src/lib/components/Editor/BodyEditor.svelte` | Editor host, plugin setup, table CSS, table detection |
| `src/lib/editor/prosemirror/parser.ts` | Table token mappings for markdown-it table parsing |
| `src/lib/editor/prosemirror/serializer.ts` | Table serialization to pipe-table markdown |
| `src/lib/parsing/core-parser.ts` | Enabled `table` rule in markdown-it CommonMark config |

---

_Last Updated: 2026-03-09_
_Status: Implemented_