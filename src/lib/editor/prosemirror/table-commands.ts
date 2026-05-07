/**
 * ProseMirror table commands for QuillMark editor.
 *
 * Provides:
 * - insertTable(rows, cols): Insert a new table at cursor
 * - convertPipeRowToTable: Convert `| col | col |` to table on Enter
 * - addRowAtEnd: Append row after last row
 * - addColumnAtEnd: Append column after last column
 * - selectRow(index): Select entire row by index
 * - selectColumn(index): Select entire column by index
 * - deleteSelectedRowsColumns: Backspace handler for row/column CellSelection deletion
 * - goToCellBelow: Enter handler — move to cell below, or add row if on last row
 * - selectAllInCell: Mod-A handler — select all content within current cell
 * - arrowOutOfTable(dir): Arrow handler — place gap cursor between adjacent tables
 */

import { type Command, TextSelection } from 'prosemirror-state';
import {
	CellSelection,
	TableMap,
	addRow,
	addColumn,
	deleteRow,
	deleteColumn,
	isInTable,
	findTable,
	selectedRect,
	cellAround
} from 'prosemirror-tables';
import { GapCursor } from 'prosemirror-gapcursor';
import { quillmarkSchema } from './schema';

const { table, table_row, table_cell, table_header, paragraph } = quillmarkSchema.nodes;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get table info from the current selection.
 * Returns the table node, its position, and the TableMap.
 */
function getTableInfo(state: import('prosemirror-state').EditorState) {
	const $from = state.selection.$from;
	const tableResult = findTable($from);
	if (!tableResult) return null;

	const { node: tableNode, pos: tablePos } = tableResult;
	const map = TableMap.get(tableNode);
	return { tableNode, tablePos, map };
}

// =============================================================================
// INSERT TABLE
// =============================================================================

/**
 * Insert a new table at the cursor position.
 * Creates a table with the specified number of rows and columns.
 * The first row uses table_header cells; subsequent rows use table_cell.
 */
export function insertTable(rows: number, cols: number): Command {
	return (state, dispatch) => {
		if (rows < 1 || cols < 1) return false;

		const headerCells = [];
		for (let c = 0; c < cols; c++) {
			headerCells.push(table_header.createAndFill()!);
		}
		const headerRow = table_row.create(null, headerCells);

		const bodyRows = [];
		for (let r = 1; r < rows; r++) {
			const cells = [];
			for (let c = 0; c < cols; c++) {
				cells.push(table_cell.createAndFill()!);
			}
			bodyRows.push(table_row.create(null, cells));
		}

		const tableNode = table.create(null, [headerRow, ...bodyRows]);

		if (dispatch) {
			const tr = state.tr.replaceSelectionWith(tableNode);
			// Place cursor in the first header cell using findFrom — reliably finds
			// the nearest valid text cursor position inside the new table structure
			const startPos = tr.mapping.map(state.selection.from);
			const resolvedPos = tr.doc.resolve(startPos);
			const sel = TextSelection.findFrom(resolvedPos, 1, true);
			if (sel) {
				tr.setSelection(sel);
			}
			dispatch(tr.scrollIntoView());
		}
		return true;
	};
}

// =============================================================================
// CONVERT PIPE ROW TO TABLE
// =============================================================================

/**
 * Convert a pipe-formatted row (| col1 | col2 |) to a table on Enter.
 * This is the first handler in the Enter chain.
 */
export const convertPipeRowToTable: Command = (state, dispatch) => {
	const { $from, empty } = state.selection;
	if (!empty) return false;

	// Must be in a paragraph
	if ($from.parent.type.name !== 'paragraph') return false;

	// Get the text content of the current paragraph
	const text = $from.parent.textContent;

	// Match pipe-table pattern: | col1 | col2 | (at least 2 columns)
	const pipeMatch = text.match(/^\s*\|(.+)\|\s*$/);
	if (!pipeMatch) return false;

	// Split by pipes and trim
	const columns = pipeMatch[1]
		.split('|')
		.map((col) => col.trim())
		.filter((col) => col.length > 0);

	if (columns.length < 2) return false;

	if (dispatch) {
		// Create header row with content from the pipe syntax
		const headerCells = columns.map((col) =>
			table_header.create(null, [paragraph.create(null, col ? [quillmarkSchema.text(col)] : [])])
		);
		const headerRow = table_row.create(null, headerCells);

		// Create one empty body row
		const bodyCells = columns.map(() => table_cell.createAndFill()!);
		const bodyRow = table_row.create(null, bodyCells);

		const tableNode = table.create(null, [headerRow, bodyRow]);

		// Replace the paragraph with the table
		const paragraphStart = $from.before($from.depth);
		const paragraphEnd = $from.after($from.depth);
		const tr = state.tr.replaceWith(paragraphStart, paragraphEnd, tableNode);

		// Place cursor in the first body cell using findFrom — reliably finds
		// the nearest valid text cursor position after the header row
		const afterHeaderPos = paragraphStart + 1 + headerRow.nodeSize;
		const resolvedPos = tr.doc.resolve(afterHeaderPos);
		const sel = TextSelection.findFrom(resolvedPos, 1, true);
		if (sel) {
			tr.setSelection(sel);
		}

		dispatch(tr.scrollIntoView());
	}
	return true;
};

// =============================================================================
// ADD ROW / ADD COLUMN AT END
// =============================================================================

/**
 * Append a new row after the last row of the table.
 * Works regardless of cursor position — uses the table from current selection.
 */
export const addRowAtEnd: Command = (state, dispatch) => {
	if (!isInTable(state)) return false;

	const info = getTableInfo(state);
	if (!info) return false;

	const { map } = info;

	if (dispatch) {
		const rect = selectedRect(state);
		const tr = addRow(state.tr, rect, map.height);
		dispatch(tr.scrollIntoView());
	}
	return true;
};

/**
 * Append a new column after the last column of the table.
 * Works regardless of cursor position — uses the table from current selection.
 */
export const addColumnAtEnd: Command = (state, dispatch) => {
	if (!isInTable(state)) return false;

	const info = getTableInfo(state);
	if (!info) return false;

	const { map } = info;

	if (dispatch) {
		const rect = selectedRect(state);
		const tr = addColumn(state.tr, rect, map.width);
		dispatch(tr.scrollIntoView());
	}
	return true;
};

// =============================================================================
// SELECT ROW / SELECT COLUMN
// =============================================================================

/**
 * Select an entire row by index.
 * Creates a CellSelection.rowSelection spanning all cells in the row.
 */
export function selectRow(index: number): Command {
	return (state, dispatch) => {
		if (!isInTable(state)) return false;

		const info = getTableInfo(state);
		if (!info) return false;

		const { tablePos, map } = info;
		if (index < 0 || index >= map.height) return false;

		// Get first and last cell positions in the row
		const firstCellPos = tablePos + 1 + map.map[index * map.width];
		const lastCellPos = tablePos + 1 + map.map[index * map.width + map.width - 1];

		const $first = state.doc.resolve(firstCellPos);
		const $last = state.doc.resolve(lastCellPos);

		if (dispatch) {
			const selection = CellSelection.rowSelection($first, $last);
			dispatch(state.tr.setSelection(selection).scrollIntoView());
		}
		return true;
	};
}

/**
 * Select an entire column by index.
 * Creates a CellSelection.colSelection spanning all cells in the column.
 */
export function selectColumn(index: number): Command {
	return (state, dispatch) => {
		if (!isInTable(state)) return false;

		const info = getTableInfo(state);
		if (!info) return false;

		const { tablePos, map } = info;
		if (index < 0 || index >= map.width) return false;

		// Get first and last cell positions in the column
		const firstCellPos = tablePos + 1 + map.map[index];
		const lastCellPos = tablePos + 1 + map.map[(map.height - 1) * map.width + index];

		const $first = state.doc.resolve(firstCellPos);
		const $last = state.doc.resolve(lastCellPos);

		if (dispatch) {
			const selection = CellSelection.colSelection($first, $last);
			dispatch(state.tr.setSelection(selection).scrollIntoView());
		}
		return true;
	};
}

// =============================================================================
// DELETE SELECTED ROWS / COLUMNS
// =============================================================================

/**
 * Backspace handler for table row/column deletion.
 * When a CellSelection covers entire rows or columns, delete them structurally
 * (not just clear contents). This must run BEFORE the tableEditing() plugin's
 * Backspace handler which only clears cell contents.
 *
 * When ALL rows or ALL columns are selected (i.e., the entire table), the table
 * node itself is deleted and replaced with an empty paragraph, since
 * prosemirror-tables' deleteRow/deleteColumn refuse to remove all rows/columns.
 *
 * After deletion, any remaining CellSelection is converted to a TextSelection
 * so the user sees a clean cursor instead of highlighted cells.
 */
export const deleteSelectedRowsColumns: Command = (state, dispatch) => {
	if (!(state.selection instanceof CellSelection)) return false;

	const sel = state.selection as CellSelection;

	// Wrap dispatch to clear CellSelection after structural deletion
	function dispatchWithClear(tr: import('prosemirror-state').Transaction) {
		if (!dispatch) return;
		if (tr.selection instanceof CellSelection) {
			const $pos = tr.doc.resolve(tr.selection.from);
			const textSel = TextSelection.findFrom($pos, 1, true);
			if (textSel) {
				tr.setSelection(textSel);
			}
		}
		dispatch(tr);
	}

	// Check if selection covers full rows
	if (sel.isRowSelection()) {
		const info = getTableInfo(state);
		if (info) {
			const rect = selectedRect(state);
			// ALL rows selected → delete entire table
			if (rect.top === 0 && rect.bottom === info.map.height) {
				if (dispatch) {
					const { tableNode, tablePos } = info;
					const tr = state.tr.replaceWith(
						tablePos,
						tablePos + tableNode.nodeSize,
						paragraph.create()
					);
					tr.setSelection(TextSelection.create(tr.doc, tablePos + 1));
					dispatch(tr.scrollIntoView());
				}
				return true;
			}
		}
		// Partial row selection: delete rows as before
		if (dispatch) {
			deleteRow(state, dispatchWithClear);
		}
		return true;
	}

	// Check if selection covers full columns
	if (sel.isColSelection()) {
		const info = getTableInfo(state);
		if (info) {
			const rect = selectedRect(state);
			// ALL columns selected → delete entire table
			if (rect.left === 0 && rect.right === info.map.width) {
				if (dispatch) {
					const { tableNode, tablePos } = info;
					const tr = state.tr.replaceWith(
						tablePos,
						tablePos + tableNode.nodeSize,
						paragraph.create()
					);
					tr.setSelection(TextSelection.create(tr.doc, tablePos + 1));
					dispatch(tr.scrollIntoView());
				}
				return true;
			}
		}
		// Partial column selection: delete columns as before
		if (dispatch) {
			deleteColumn(state, dispatchWithClear);
		}
		return true;
	}

	// Not a full row/column selection — let default handling clear contents
	return false;
};

// =============================================================================
// SELECT ALL IN CELL (Mod-A handler)
// =============================================================================

/**
 * Mod-A handler for table cells: select all content within the current cell
 * instead of selecting the entire document.
 *
 * Only fires when the cursor is inside a table cell.
 * Returns false if not in a table, allowing the default selectAll to run.
 */
export const selectAllInCell: Command = (state, dispatch) => {
	if (!isInTable(state)) return false;

	const $cell = cellAround(state.selection.$from);
	if (!$cell) return false;

	const cellNode = $cell.nodeAfter;
	if (!cellNode) return false;

	// Find first and last valid text cursor positions inside the cell
	const cellStart = $cell.pos + 1;
	const cellEnd = $cell.pos + 1 + cellNode.content.size;
	const $from = state.doc.resolve(cellStart);
	const $to = state.doc.resolve(cellEnd);

	const fromSel = TextSelection.findFrom($from, 1, true);
	const toSel = TextSelection.findFrom($to, -1, true);
	if (!fromSel || !toSel) return false;

	if (dispatch) {
		dispatch(state.tr.setSelection(TextSelection.create(state.doc, fromSel.from, toSel.to)));
	}
	return true;
};

// =============================================================================
// GO TO CELL BELOW (Enter handler)
// =============================================================================

/**
 * Enter handler for table cells: move cursor to the cell directly below.
 * If the cursor is on the last row, a new row is appended first.
 * This gives tables spreadsheet-like Enter navigation.
 *
 * Only fires when the cursor is inside a table cell (TextSelection, not CellSelection).
 * Returns false if not in a table, allowing the Enter chain to continue.
 */
export const goToCellBelow: Command = (state, dispatch) => {
	if (!isInTable(state)) return false;
	// Only handle collapsed text cursor, not CellSelection or range selections
	if (!state.selection.empty) return false;
	if (state.selection instanceof CellSelection) return false;

	const info = getTableInfo(state);
	if (!info) return false;

	const { tableNode, tablePos, map } = info;

	// Find which cell the cursor is in using cellAround (walks up from cursor)
	const $cell = cellAround(state.selection.$from);
	if (!$cell) return false;

	// cellAround returns a resolved position pointing at the cell node.
	// Its offset within the table = $cell.pos - tablePos - 1
	const cellOffset = $cell.pos - tablePos - 1;
	let cellRect: { left: number; right: number; top: number; bottom: number };
	try {
		cellRect = map.findCell(cellOffset);
	} catch {
		return false;
	}

	const currentRow = cellRect.top;
	const currentCol = cellRect.left;

	if (currentRow + 1 < map.height) {
		// There IS a row below — move cursor there
		if (dispatch) {
			const targetOffset = map.positionAt(currentRow + 1, currentCol, tableNode);
			const targetPos = tablePos + 1 + targetOffset;
			const $pos = state.doc.resolve(targetPos);
			const sel = TextSelection.findFrom($pos, 1, true);
			if (sel) {
				dispatch(state.tr.setSelection(sel).scrollIntoView());
			}
		}
		return true;
	}

	// Last row — add a new row, then move into it
	if (dispatch) {
		const rect = selectedRect(state);
		let tr = addRow(state.tr, rect, map.height);

		// After addRow, the table structure changed. Re-resolve positions.
		const newTableResult = findTable(tr.doc.resolve(tablePos + 1));
		if (newTableResult) {
			const newMap = TableMap.get(newTableResult.node);
			const targetOffset = newMap.positionAt(map.height, currentCol, newTableResult.node);
			const targetPos = newTableResult.pos + 1 + targetOffset;
			const $pos = tr.doc.resolve(targetPos);
			const sel = TextSelection.findFrom($pos, 1, true);
			if (sel) {
				tr = tr.setSelection(sel);
			}
		}
		dispatch(tr.scrollIntoView());
	}
	return true;
};

// =============================================================================
// ARROW: Gap cursor between adjacent tables
// =============================================================================

/**
 * Check if the cursor is at the structural edge of a table cell.
 * Walks up from the cursor to the cell boundary, verifying that every
 * ancestor index is at the edge in the given direction.
 *
 * Returns true if the cursor is at the very start (dir=-1) or end (dir=1)
 * of the cell's content.
 */
function atCellEdge(state: import('prosemirror-state').EditorState, dir: 1 | -1): boolean {
	if (!(state.selection instanceof TextSelection)) return false;
	const $head = state.selection.$head;
	for (let d = $head.depth - 1; d >= 0; d--) {
		const parent = $head.node(d);
		const index = dir < 0 ? $head.index(d) : $head.indexAfter(d);
		if (index !== (dir < 0 ? 0 : parent.childCount)) return false;
		const role = parent.type.spec.tableRole;
		if (role === 'cell' || role === 'header_cell') return true;
	}
	return false;
}

/**
 * Arrow key handler for navigating between adjacent tables.
 *
 * When the cursor is at the boundary of a table (last row for down, first row
 * for up) and the adjacent sibling is also a table, prosemirror-tables' arrow
 * handler jumps directly into the next table — skipping the gap between them.
 *
 * This command intercepts that case and places a GapCursor between the tables,
 * allowing the user to type or press Enter to insert content between them.
 *
 * Must be registered BEFORE tableEditing() in the plugin list.
 */
export function arrowOutOfTable(dir: 'down' | 'up'): Command {
	return (state, dispatch, view) => {
		if (!view || !isInTable(state)) return false;
		if (!state.selection.empty || state.selection instanceof CellSelection) return false;

		// Visual check: cursor must be at the visual edge of the textblock
		if (!view.endOfTextblock(dir)) return false;

		// Structural check: cursor must be at the edge of the cell content
		const dirSign = dir === 'down' ? 1 : -1;
		if (!atCellEdge(state, dirSign)) return false;

		const info = getTableInfo(state);
		if (!info) return false;

		// Check cursor is in the boundary row (last row for down, first row for up)
		const $cell = cellAround(state.selection.$from);
		if (!$cell) return false;
		const cellOffset = $cell.pos - info.tablePos - 1;
		let cellRect: { top: number; bottom: number };
		try {
			cellRect = info.map.findCell(cellOffset);
		} catch {
			return false;
		}

		if (dir === 'down' && cellRect.bottom !== info.map.height) return false;
		if (dir === 'up' && cellRect.top !== 0) return false;

		// Check if the adjacent sibling is also a table
		if (dir === 'down') {
			const afterPos = info.tablePos + info.tableNode.nodeSize;
			if (afterPos >= state.doc.content.size) return false;
			const nodeAfter = state.doc.nodeAt(afterPos);
			if (!nodeAfter || nodeAfter.type !== table) return false;

			if (dispatch) {
				const $gap = state.doc.resolve(afterPos);
				dispatch(state.tr.setSelection(new GapCursor($gap)).scrollIntoView());
			}
			return true;
		} else {
			const $tableStart = state.doc.resolve(info.tablePos);
			const nodeBefore = $tableStart.nodeBefore;
			if (!nodeBefore || nodeBefore.type !== table) return false;

			if (dispatch) {
				const $gap = state.doc.resolve(info.tablePos);
				dispatch(state.tr.setSelection(new GapCursor($gap)).scrollIntoView());
			}
			return true;
		}
	};
}

// Re-export commonly used utilities from prosemirror-tables
export { isInTable, findTable, CellSelection, TableMap } from 'prosemirror-tables';
