import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { cellAround } from 'prosemirror-tables';
import { quillmarkSchema } from './schema';
import {
	insertTable,
	convertPipeRowToTable,
	addRowAtEnd,
	addColumnAtEnd,
	selectRow,
	selectColumn,
	deleteSelectedRowsColumns,
	goToCellBelow,
	selectAllInCell,
	arrowOutOfTable,
	isInTable,
	findTable,
	CellSelection,
	TableMap
} from './table-commands';

const { doc, paragraph, table, table_row, table_cell, table_header } = quillmarkSchema.nodes;

/**
 * Helper: create a minimal ProseMirror state with a document.
 */
function createState(docContent: import('prosemirror-model').Node) {
	return EditorState.create({ doc: docContent, schema: quillmarkSchema });
}

/**
 * Helper: create a simple 2x2 table node (1 header row + 1 body row).
 * Cells use block+ content model: each cell wraps content in a paragraph.
 */
function makeTable(headers: string[], body: string[][]) {
	const headerCells = headers.map((text) =>
		table_header.create(null, [paragraph.create(null, text ? [quillmarkSchema.text(text)] : [])])
	);
	const headerRow = table_row.create(null, headerCells);

	const bodyRows = body.map((row) => {
		const cells = row.map((text) =>
			table_cell.create(null, [paragraph.create(null, text ? [quillmarkSchema.text(text)] : [])])
		);
		return table_row.create(null, cells);
	});

	return table.create(null, [headerRow, ...bodyRows]);
}

/**
 * Helper: create a state with cursor inside the table.
 * Uses TextSelection.findFrom to reliably find a valid cursor position
 * in the first body cell regardless of cell content model.
 */
function stateWithTableAndCursor(headers: string[], body: string[][]) {
	const t = makeTable(headers, body);
	const docNode = doc.create(null, [t]);
	const state = createState(docNode);

	// Find the first valid cursor position in the first body cell
	// Navigate past: doc opening (0→1) + table opening (1→2) + full header row
	const headerRow = t.firstChild!;
	const afterHeaderRow = 1 + 1 + headerRow.nodeSize; // 1(doc→table) + 1(table→first row) + headerRow size
	const resolvedPos = docNode.resolve(afterHeaderRow);
	const sel = TextSelection.findFrom(resolvedPos, 1, true);
	if (sel) {
		return state.apply(state.tr.setSelection(sel));
	}
	// Fallback: try placing in first header cell
	const fallbackPos = docNode.resolve(1);
	const fallbackSel = TextSelection.findFrom(fallbackPos, 1, true);
	if (fallbackSel) {
		return state.apply(state.tr.setSelection(fallbackSel));
	}
	return state;
}

// =============================================================================
// TESTS
// =============================================================================

describe('Table Commands', () => {
	// ─── insertTable ────────────────────────────────────────────

	describe('insertTable', () => {
		it('inserts a 3x3 table at cursor position', () => {
			const docNode = doc.create(null, [paragraph.create()]);
			const state = createState(docNode);

			let dispatched = false;
			insertTable(3, 3)(state, (tr) => {
				dispatched = true;
				const newDoc = tr.doc;
				// Find the table
				let foundTable = false;
				newDoc.descendants((node) => {
					if (node.type === table) {
						foundTable = true;
						expect(node.childCount).toBe(3); // 1 header + 2 body rows
						// First row should have header cells
						const firstRow = node.firstChild!;
						firstRow.forEach((cell) => {
							expect(cell.type.name).toBe('table_header');
						});
						// Body rows should have regular cells
						const secondRow = node.child(1);
						secondRow.forEach((cell) => {
							expect(cell.type.name).toBe('table_cell');
						});
					}
				});
				expect(foundTable).toBe(true);
			});
			expect(dispatched).toBe(true);
		});

		it('rejects zero or negative dimensions', () => {
			const docNode = doc.create(null, [paragraph.create()]);
			const state = createState(docNode);

			expect(insertTable(0, 3)(state)).toBe(false);
			expect(insertTable(3, 0)(state)).toBe(false);
			expect(insertTable(-1, 3)(state)).toBe(false);
		});

		it('inserts a 1x1 table', () => {
			const docNode = doc.create(null, [paragraph.create()]);
			const state = createState(docNode);

			let dispatched = false;
			insertTable(1, 1)(state, (tr) => {
				dispatched = true;
				let foundTable = false;
				tr.doc.descendants((node) => {
					if (node.type === table) {
						foundTable = true;
						expect(node.childCount).toBe(1); // Only header row
					}
				});
				expect(foundTable).toBe(true);
			});
			expect(dispatched).toBe(true);
		});
	});

	// ─── convertPipeRowToTable ──────────────────────────────────

	describe('convertPipeRowToTable', () => {
		it('converts pipe syntax to a table', () => {
			const text = '| Name | Age |';
			const docNode = doc.create(null, [paragraph.create(null, [quillmarkSchema.text(text)])]);
			const state = createState(docNode).apply(
				createState(docNode).tr.setSelection(TextSelection.create(docNode, text.length + 1))
			);

			let dispatched = false;
			convertPipeRowToTable(state, (tr) => {
				dispatched = true;
				let foundTable = false;
				tr.doc.descendants((node) => {
					if (node.type === table) {
						foundTable = true;
						expect(node.childCount).toBe(2); // header + 1 body row
						const firstRow = node.firstChild!;
						expect(firstRow.firstChild!.textContent).toBe('Name');
						expect(firstRow.child(1).textContent).toBe('Age');
					}
				});
				expect(foundTable).toBe(true);
			});
			expect(dispatched).toBe(true);
		});

		it('ignores text that is not pipe syntax', () => {
			const text = 'Hello world';
			const docNode = doc.create(null, [paragraph.create(null, [quillmarkSchema.text(text)])]);
			const state = createState(docNode).apply(
				createState(docNode).tr.setSelection(TextSelection.create(docNode, text.length + 1))
			);

			expect(convertPipeRowToTable(state)).toBe(false);
		});

		it('requires at least 2 columns', () => {
			const text = '| single |';
			const docNode = doc.create(null, [paragraph.create(null, [quillmarkSchema.text(text)])]);
			const state = createState(docNode).apply(
				createState(docNode).tr.setSelection(TextSelection.create(docNode, text.length + 1))
			);

			expect(convertPipeRowToTable(state)).toBe(false);
		});

		it('handles three columns', () => {
			const text = '| A | B | C |';
			const docNode = doc.create(null, [paragraph.create(null, [quillmarkSchema.text(text)])]);
			const state = createState(docNode).apply(
				createState(docNode).tr.setSelection(TextSelection.create(docNode, text.length + 1))
			);

			let dispatched = false;
			convertPipeRowToTable(state, (tr) => {
				dispatched = true;
				let foundTable = false;
				tr.doc.descendants((node) => {
					if (node.type === table) {
						foundTable = true;
						const firstRow = node.firstChild!;
						expect(firstRow.childCount).toBe(3);
						expect(firstRow.firstChild!.textContent).toBe('A');
						expect(firstRow.child(1).textContent).toBe('B');
						expect(firstRow.child(2).textContent).toBe('C');
					}
				});
				expect(foundTable).toBe(true);
			});
			expect(dispatched).toBe(true);
		});
	});

	// ─── addRowAtEnd / addColumnAtEnd ───────────────────────────

	describe('addRowAtEnd', () => {
		it('appends a row to a 2x2 table', () => {
			const state = stateWithTableAndCursor(['A', 'B'], [['1', '2']]);
			expect(isInTable(state)).toBe(true);

			let dispatched = false;
			addRowAtEnd(state, (tr) => {
				dispatched = true;
				let foundTable = false;
				tr.doc.descendants((node) => {
					if (node.type === table) {
						foundTable = true;
						expect(node.childCount).toBe(3); // header + original body + new

						// Verify original body row is still second (index 1) and new row is last (index 2)
						const bodyRow = node.child(1);
						expect(bodyRow.child(0).textContent).toBe('1');
						expect(bodyRow.child(1).textContent).toBe('2');

						const newRow = node.child(2);
						expect(newRow.child(0).textContent).toBe('');
						expect(newRow.child(1).textContent).toBe('');
					}
				});
				expect(foundTable).toBe(true);
			});
			expect(dispatched).toBe(true);
		});

		it('returns false when cursor is not in a table', () => {
			const docNode = doc.create(null, [paragraph.create()]);
			const state = createState(docNode);
			expect(addRowAtEnd(state)).toBe(false);
		});
	});

	describe('addColumnAtEnd', () => {
		it('appends a column to a 2x2 table', () => {
			const state = stateWithTableAndCursor(['A', 'B'], [['1', '2']]);
			expect(isInTable(state)).toBe(true);

			let dispatched = false;
			addColumnAtEnd(state, (tr) => {
				dispatched = true;
				let foundTable = false;
				tr.doc.descendants((node) => {
					if (node.type === table) {
						foundTable = true;
						// Each row should now have 3 cells
						node.forEach((row) => {
							expect(row.childCount).toBe(3);
						});

						// Verify original columns are intact and new column is last
						const headerRow = node.child(0);
						expect(headerRow.child(0).textContent).toBe('A');
						expect(headerRow.child(1).textContent).toBe('B');
						expect(headerRow.child(2).textContent).toBe('');

						const bodyRow = node.child(1);
						expect(bodyRow.child(0).textContent).toBe('1');
						expect(bodyRow.child(1).textContent).toBe('2');
						expect(bodyRow.child(2).textContent).toBe('');
					}
				});
				expect(foundTable).toBe(true);
			});
			expect(dispatched).toBe(true);
		});

		it('returns false when cursor is not in a table', () => {
			const docNode = doc.create(null, [paragraph.create()]);
			const state = createState(docNode);
			expect(addColumnAtEnd(state)).toBe(false);
		});
	});

	// ─── selectRow / selectColumn ───────────────────────────────

	describe('selectRow', () => {
		it('selects a row by index', () => {
			const state = stateWithTableAndCursor(['A', 'B'], [['1', '2']]);

			let dispatched = false;
			selectRow(0)(state, (tr) => {
				dispatched = true;
				expect(tr.selection instanceof CellSelection).toBe(true);
			});
			expect(dispatched).toBe(true);
		});

		it('returns false for invalid index', () => {
			const state = stateWithTableAndCursor(['A', 'B'], [['1', '2']]);
			expect(selectRow(10)(state)).toBe(false);
			expect(selectRow(-1)(state)).toBe(false);
		});

		it('returns false when not in table', () => {
			const docNode = doc.create(null, [paragraph.create()]);
			const state = createState(docNode);
			expect(selectRow(0)(state)).toBe(false);
		});
	});

	describe('selectColumn', () => {
		it('selects a column by index', () => {
			const state = stateWithTableAndCursor(['A', 'B'], [['1', '2']]);

			let dispatched = false;
			selectColumn(0)(state, (tr) => {
				dispatched = true;
				expect(tr.selection instanceof CellSelection).toBe(true);
			});
			expect(dispatched).toBe(true);
		});

		it('returns false for invalid index', () => {
			const state = stateWithTableAndCursor(['A', 'B'], [['1', '2']]);
			expect(selectColumn(10)(state)).toBe(false);
			expect(selectColumn(-1)(state)).toBe(false);
		});
	});

	// ─── deleteSelectedRowsColumns ──────────────────────────────

	describe('deleteSelectedRowsColumns', () => {
		it('returns false when selection is not a CellSelection', () => {
			const docNode = doc.create(null, [paragraph.create()]);
			const state = createState(docNode);
			expect(deleteSelectedRowsColumns(state)).toBe(false);
		});

		it('returns false for TextSelection in table', () => {
			const state = stateWithTableAndCursor(['A', 'B'], [['1', '2']]);
			expect(deleteSelectedRowsColumns(state)).toBe(false);
		});

		it('deletes a selected row', () => {
			const state = stateWithTableAndCursor(
				['A', 'B'],
				[
					['1', '2'],
					['3', '4']
				]
			);

			// Select row 1 (second body row)
			let stateWithSelection = state;
			selectRow(1)(state, (tr) => {
				stateWithSelection = state.apply(tr);
			});

			let dispatched = false;
			deleteSelectedRowsColumns(stateWithSelection, (tr) => {
				dispatched = true;
				// Table should have fewer rows
				let foundTable = false;
				tr.doc.descendants((node) => {
					if (node.type === table) {
						foundTable = true;
						// Original had 3 rows (header + 2 body), now should have 2
						expect(node.childCount).toBe(2);
					}
				});
				expect(foundTable).toBe(true);
			});
			expect(dispatched).toBe(true);
		});

		it('deletes a selected column', () => {
			const state = stateWithTableAndCursor(['A', 'B'], [['1', '2']]);

			// Select column 0
			let stateWithSelection = state;
			selectColumn(0)(state, (tr) => {
				stateWithSelection = state.apply(tr);
			});

			let dispatched = false;
			deleteSelectedRowsColumns(stateWithSelection, (tr) => {
				dispatched = true;
				let foundTable = false;
				tr.doc.descendants((node) => {
					if (node.type === table) {
						foundTable = true;
						// Each row should now have 1 cell
						node.forEach((row) => {
							expect(row.childCount).toBe(1);
						});
					}
				});
				expect(foundTable).toBe(true);
			});
			expect(dispatched).toBe(true);
		});

		it('clears CellSelection to TextSelection after deleting a column', () => {
			const state = stateWithTableAndCursor(['A', 'B'], [['1', '2']]);

			// Select column 0
			let stateWithSelection = state;
			selectColumn(0)(state, (tr) => {
				stateWithSelection = state.apply(tr);
			});
			expect(stateWithSelection.selection instanceof CellSelection).toBe(true);

			let resultTr: import('prosemirror-state').Transaction | null = null;
			deleteSelectedRowsColumns(stateWithSelection, (tr) => {
				resultTr = tr;
			});
			expect(resultTr).not.toBeNull();
			// After deletion, selection should be a TextSelection, not CellSelection
			expect(resultTr!.selection instanceof CellSelection).toBe(false);
			expect(resultTr!.selection instanceof TextSelection).toBe(true);
		});

		it('clears CellSelection to TextSelection after deleting a row', () => {
			const state = stateWithTableAndCursor(
				['A', 'B'],
				[
					['1', '2'],
					['3', '4']
				]
			);

			// Select body row 1
			let stateWithSelection = state;
			selectRow(1)(state, (tr) => {
				stateWithSelection = state.apply(tr);
			});
			expect(stateWithSelection.selection instanceof CellSelection).toBe(true);

			let resultTr: import('prosemirror-state').Transaction | null = null;
			deleteSelectedRowsColumns(stateWithSelection, (tr) => {
				resultTr = tr;
			});
			expect(resultTr).not.toBeNull();
			// After deletion, selection should be a TextSelection, not CellSelection
			expect(resultTr!.selection instanceof CellSelection).toBe(false);
			expect(resultTr!.selection instanceof TextSelection).toBe(true);
		});

		it('deletes entire table when all rows are selected', () => {
			const state = stateWithTableAndCursor(
				['A', 'B'],
				[
					['1', '2'],
					['3', '4']
				]
			);

			// Select all rows (header row 0 through body row 2)
			let stateWithSelection = state;
			const info = findTable(state.selection.$from)!;
			const map = TableMap.get(info.node);
			const firstCellPos = info.pos + 1 + map.map[0];
			const lastCellPos = info.pos + 1 + map.map[(map.height - 1) * map.width + map.width - 1];
			const $first = state.doc.resolve(firstCellPos);
			const $last = state.doc.resolve(lastCellPos);
			const allRowsSel = CellSelection.rowSelection($first, $last);
			stateWithSelection = state.apply(state.tr.setSelection(allRowsSel));

			let resultTr: import('prosemirror-state').Transaction | null = null;
			deleteSelectedRowsColumns(stateWithSelection, (tr) => {
				resultTr = tr;
			});

			expect(resultTr).not.toBeNull();
			// Table should be gone — no table node in the document
			let foundTable = false;
			resultTr!.doc.descendants((node) => {
				if (node.type === table) foundTable = true;
			});
			expect(foundTable).toBe(false);
			// Should have a paragraph instead
			expect(resultTr!.doc.firstChild!.type.name).toBe('paragraph');
			// Cursor should be a TextSelection inside the paragraph
			expect(resultTr!.selection instanceof TextSelection).toBe(true);
		});

		it('deletes entire table when all columns are selected', () => {
			const state = stateWithTableAndCursor(['A', 'B'], [['1', '2']]);

			// Select all columns (column 0 through column 1)
			let stateWithSelection = state;
			const info = findTable(state.selection.$from)!;
			const map = TableMap.get(info.node);
			const firstCellPos = info.pos + 1 + map.map[0];
			const lastCellPos = info.pos + 1 + map.map[map.width - 1];
			const $first = state.doc.resolve(firstCellPos);
			const $last = state.doc.resolve(lastCellPos);
			const allColsSel = CellSelection.colSelection($first, $last);
			stateWithSelection = state.apply(state.tr.setSelection(allColsSel));

			let resultTr: import('prosemirror-state').Transaction | null = null;
			deleteSelectedRowsColumns(stateWithSelection, (tr) => {
				resultTr = tr;
			});

			expect(resultTr).not.toBeNull();
			// Table should be gone
			let foundTable = false;
			resultTr!.doc.descendants((node) => {
				if (node.type === table) foundTable = true;
			});
			expect(foundTable).toBe(false);
			// Should have a paragraph instead
			expect(resultTr!.doc.firstChild!.type.name).toBe('paragraph');
		});

		it('deletes table when it is the only element in the document', () => {
			// Table as sole top-level block
			const t = makeTable(['A', 'B'], [['1', '2']]);
			const docNode = doc.create(null, [t]);
			let state = createState(docNode);
			// Place cursor inside the table
			const sel = TextSelection.findFrom(docNode.resolve(1), 1, true);
			if (sel) state = state.apply(state.tr.setSelection(sel));

			// Select all rows
			const info = findTable(state.selection.$from)!;
			const map = TableMap.get(info.node);
			const firstCellPos = info.pos + 1 + map.map[0];
			const lastCellPos = info.pos + 1 + map.map[(map.height - 1) * map.width + map.width - 1];
			const $first = state.doc.resolve(firstCellPos);
			const $last = state.doc.resolve(lastCellPos);
			const allRowsSel = CellSelection.rowSelection($first, $last);
			state = state.apply(state.tr.setSelection(allRowsSel));

			let resultTr: import('prosemirror-state').Transaction | null = null;
			deleteSelectedRowsColumns(state, (tr) => {
				resultTr = tr;
			});

			expect(resultTr).not.toBeNull();
			// Document should have exactly one child: an empty paragraph
			expect(resultTr!.doc.childCount).toBe(1);
			expect(resultTr!.doc.firstChild!.type.name).toBe('paragraph');
			expect(resultTr!.doc.firstChild!.textContent).toBe('');
			// Cursor should be valid
			expect(resultTr!.selection instanceof TextSelection).toBe(true);
		});

		it('still deletes partial rows when not all rows are selected', () => {
			const state = stateWithTableAndCursor(
				['A', 'B'],
				[
					['1', '2'],
					['3', '4']
				]
			);

			// Select only row 1 (first body row), not all rows
			let stateWithSelection = state;
			selectRow(1)(state, (tr) => {
				stateWithSelection = state.apply(tr);
			});

			let dispatched = false;
			deleteSelectedRowsColumns(stateWithSelection, (tr) => {
				dispatched = true;
				// Table should still exist with fewer rows
				let foundTable = false;
				tr.doc.descendants((node) => {
					if (node.type === table) {
						foundTable = true;
						expect(node.childCount).toBe(2); // header + 1 remaining body row
					}
				});
				expect(foundTable).toBe(true);
			});
			expect(dispatched).toBe(true);
		});
	});

	// ─── isInTable / findTable ──────────────────────────────────

	describe('isInTable', () => {
		it('returns true when cursor is in a table', () => {
			const state = stateWithTableAndCursor(['A', 'B'], [['1', '2']]);
			expect(isInTable(state)).toBe(true);
		});

		it('returns false when cursor is not in a table', () => {
			const docNode = doc.create(null, [paragraph.create()]);
			const state = createState(docNode);
			expect(isInTable(state)).toBe(false);
		});
	});

	describe('findTable', () => {
		it('finds the table node from cursor position', () => {
			const state = stateWithTableAndCursor(['A', 'B'], [['1', '2']]);
			const result = findTable(state.selection.$from);
			expect(result).not.toBeNull();
			expect(result!.node.type).toBe(table);
		});

		it('returns null when not in a table', () => {
			const docNode = doc.create(null, [paragraph.create()]);
			const state = createState(docNode);
			const result = findTable(state.selection.$from);
			expect(result).toBeNull();
		});
	});

	// ─── TableMap ───────────────────────────────────────────────

	describe('TableMap', () => {
		it('reports correct dimensions for a 2x3 table', () => {
			const t = makeTable(['A', 'B', 'C'], [['1', '2', '3']]);
			const map = TableMap.get(t);
			expect(map.width).toBe(3);
			expect(map.height).toBe(2);
		});

		it('reports correct dimensions for a 3x2 table', () => {
			const t = makeTable(
				['A', 'B'],
				[
					['1', '2'],
					['3', '4']
				]
			);
			const map = TableMap.get(t);
			expect(map.width).toBe(2);
			expect(map.height).toBe(3);
		});
	});

	// ─── goToCellBelow ─────────────────────────────────────────

	/**
	 * Helper: create a state with cursor in a specific cell (row, col).
	 * Row 0 = header row, row 1+ = body rows.
	 */
	function stateWithCursorAt(headers: string[], body: string[][], row: number, col: number) {
		const t = makeTable(headers, body);
		const docNode = doc.create(null, [t]);
		const state = createState(docNode);
		const map = TableMap.get(t);
		// findTable returns tablePos=0 for table as first child of doc.
		// Absolute cell position = tablePos + 1 (enter table) + cellOffset
		const cellOffset = map.positionAt(row, col, t);
		const targetPos = 1 + cellOffset;
		const $pos = docNode.resolve(targetPos);
		const sel = TextSelection.findFrom($pos, 1, true);
		if (sel) {
			return state.apply(state.tr.setSelection(sel));
		}
		return state;
	}

	/**
	 * Helper: get the (row, col) of the cell containing the cursor.
	 * Uses cellAround to walk up from cursor to cell boundary,
	 * then map.findCell with the cell's exact offset.
	 */
	function getCursorCellCoords(state: EditorState) {
		const $cell = cellAround(state.selection.$from);
		if (!$cell) throw new Error('Cursor is not inside a table cell');
		const info = findTable(state.selection.$from);
		if (!info) throw new Error('No table found');
		const map = TableMap.get(info.node);
		const cellOffset = $cell.pos - info.pos - 1;
		const cellRect = map.findCell(cellOffset);
		return { row: cellRect.top, col: cellRect.left, map };
	}

	describe('goToCellBelow', () => {
		it('moves cursor from body row to the next body row (same column)', () => {
			const state = stateWithCursorAt(
				['A', 'B'],
				[
					['1', '2'],
					['3', '4']
				],
				1,
				0
			); // cursor in first body row, col 0 (cell "1")

			let resultState: EditorState | null = null;
			goToCellBelow(state, (tr) => {
				resultState = state.apply(tr);
			});

			expect(resultState).not.toBeNull();
			// Cursor should now be in cell "3" (row 2, col 0)
			const { row, col } = getCursorCellCoords(resultState!);
			expect(row).toBe(2); // row 2 (0-indexed: header=0, body1=1, body2=2)
			expect(col).toBe(0); // same column
		});

		it('moves cursor from header row to first body row (same column)', () => {
			const state = stateWithCursorAt(['A', 'B'], [['1', '2']], 0, 1); // cursor in header row, col 1 (cell "B")

			let resultState: EditorState | null = null;
			goToCellBelow(state, (tr) => {
				resultState = state.apply(tr);
			});

			expect(resultState).not.toBeNull();
			const { row, col } = getCursorCellCoords(resultState!);
			expect(row).toBe(1); // first body row
			expect(col).toBe(1); // same column
		});

		it('adds a new row and moves there when on the last row', () => {
			const state = stateWithCursorAt(['A', 'B'], [['1', '2']], 1, 0); // cursor in last body row, col 0

			let resultState: EditorState | null = null;
			goToCellBelow(state, (tr) => {
				resultState = state.apply(tr);
			});

			expect(resultState).not.toBeNull();
			// Table should now have 3 rows (header + original body + new)
			const { row, col, map } = getCursorCellCoords(resultState!);
			expect(map.height).toBe(3);
			// Cursor should be in the new row (row 2), same column
			expect(row).toBe(2);
			expect(col).toBe(0);
		});

		it('returns false when cursor is not in a table', () => {
			const docNode = doc.create(null, [paragraph.create()]);
			const state = createState(docNode);
			expect(goToCellBelow(state)).toBe(false);
		});

		it('returns false when selection is not empty (range selected)', () => {
			const state = stateWithCursorAt(['A', 'B'], [['1', '2']], 1, 0);
			// Create a range selection within the cell
			const from = state.selection.from;
			const stateWithRange = state.apply(
				state.tr.setSelection(TextSelection.create(state.doc, from, from + 1))
			);
			expect(goToCellBelow(stateWithRange)).toBe(false);
		});

		it('preserves column when moving down in a 3-column table', () => {
			const state = stateWithCursorAt(
				['A', 'B', 'C'],
				[
					['1', '2', '3'],
					['4', '5', '6']
				],
				1,
				2
			); // cursor in first body row, col 2 (cell "3")

			let resultState: EditorState | null = null;
			goToCellBelow(state, (tr) => {
				resultState = state.apply(tr);
			});

			expect(resultState).not.toBeNull();
			const { row, col } = getCursorCellCoords(resultState!);
			expect(row).toBe(2); // second body row
			expect(col).toBe(2); // same column (col 2)
		});
	});

	// ─── selectAllInCell ─────────────────────────────────────────

	describe('selectAllInCell', () => {
		it('selects all content within the current cell', () => {
			const state = stateWithCursorAt(['A', 'B'], [['hello', 'world']], 1, 0);

			let resultState: EditorState | null = null;
			selectAllInCell(state, (tr) => {
				resultState = state.apply(tr);
			});

			expect(resultState).not.toBeNull();
			// Selection should not be empty (it covers the cell content)
			expect(resultState!.selection.empty).toBe(false);
			// The selected text should be the cell content
			const slice = resultState!.selection.content();
			let text = '';
			slice.content.descendants((node) => {
				if (node.isText) text += node.text;
			});
			expect(text).toBe('hello');
		});

		it('returns false when cursor is not in a table', () => {
			const docNode = doc.create(null, [paragraph.create()]);
			const state = createState(docNode);
			expect(selectAllInCell(state)).toBe(false);
		});

		it('selects empty cell content without error', () => {
			const state = stateWithCursorAt(['A', 'B'], [['', 'text']], 1, 0);

			let resultState: EditorState | null = null;
			selectAllInCell(state, (tr) => {
				resultState = state.apply(tr);
			});

			expect(resultState).not.toBeNull();
			// For an empty cell, selection anchors at the paragraph boundary
			const { from, to } = resultState!.selection;
			expect(from).toBeLessThanOrEqual(to);
		});
	});

	// ─── arrowOutOfTable ────────────────────────────────────────

	describe('arrowOutOfTable', () => {
		it('returns false when cursor is not in a table', () => {
			const docNode = doc.create(null, [paragraph.create()]);
			const state = createState(docNode);
			expect(arrowOutOfTable('down')(state)).toBe(false);
			expect(arrowOutOfTable('up')(state)).toBe(false);
		});

		it('returns false without a view (view is required for endOfTextblock)', () => {
			const state = stateWithCursorAt(['A', 'B'], [['1', '2']], 1, 0);
			// Called without view argument — should return false
			expect(arrowOutOfTable('down')(state, undefined, undefined)).toBe(false);
		});

		it('returns false when selection is not empty', () => {
			const state = stateWithCursorAt(['A', 'B'], [['1', '2']], 1, 0);
			const from = state.selection.from;
			const rangeState = state.apply(
				state.tr.setSelection(TextSelection.create(state.doc, from, from + 1))
			);
			expect(arrowOutOfTable('down')(rangeState)).toBe(false);
		});
	});
});
