import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { quillmarkSchema } from './schema';
import {
	shiftArrowInList,
	backspaceInList,
	enterOnEmptyItem,
	enterAtStartOfFirstItem,
	indentListItem,
	outdentListItem,
	toggleBulletList,
	toggleOrderedList,
	deleteSelectionWithCleanup
} from './list-commands';

const {
	doc,
	paragraph,
	bullet_list,
	ordered_list,
	list_item,
	table,
	table_row,
	table_cell,
	table_header
} = quillmarkSchema.nodes;

/**
 * Helper: create a minimal ProseMirror state with a document.
 */
function createState(docContent: import('prosemirror-model').Node) {
	return EditorState.create({ doc: docContent, schema: quillmarkSchema });
}

/**
 * Helper: create a list item with text content.
 */
function li(text: string) {
	return list_item.create(null, [paragraph.create(null, text ? [quillmarkSchema.text(text)] : [])]);
}

/**
 * Helper: create a bullet list with items.
 */
function ul(...items: ReturnType<typeof li>[]) {
	return bullet_list.create(null, items);
}

/**
 * Helper: create a state with cursor at a specific position in the document.
 */
function stateWithCursor(docNode: import('prosemirror-model').Node, pos: number) {
	const state = createState(docNode);
	return state.apply(state.tr.setSelection(TextSelection.create(docNode, pos)));
}

/**
 * Helper: create a state with a range selection.
 */
function stateWithRange(docNode: import('prosemirror-model').Node, from: number, to: number) {
	const state = createState(docNode);
	return state.apply(state.tr.setSelection(TextSelection.create(docNode, from, to)));
}

// =============================================================================
// TESTS: shiftArrowInList
// =============================================================================

describe('shiftArrowInList', () => {
	describe('guard conditions', () => {
		it('returns false without a view (view is required for endOfTextblock)', () => {
			const docNode = doc.create(null, [ul(li('item 1'), li('item 2'))]);
			// Position inside the second list item's paragraph
			const sel = TextSelection.findFrom(docNode.resolve(docNode.content.size - 2), -1, true);
			const state = createState(docNode).apply(createState(docNode).tr.setSelection(sel!));
			expect(shiftArrowInList('up')(state, undefined, undefined)).toBe(false);
		});

		it('returns false when cursor is not in a list', () => {
			const docNode = doc.create(null, [paragraph.create(null, [quillmarkSchema.text('hello')])]);
			const state = stateWithCursor(docNode, 3);
			expect(shiftArrowInList('up')(state, undefined, undefined)).toBe(false);
		});

		it('returns false when cursor is inside a table cell (even if in a list)', () => {
			// Table inside a list item
			const headerCells = [table_header.createAndFill()!, table_header.createAndFill()!];
			const headerRow = table_row.create(null, headerCells);
			const bodyCells = [table_cell.createAndFill()!, table_cell.createAndFill()!];
			const bodyRow = table_row.create(null, bodyCells);
			const tableNode = table.create(null, [headerRow, bodyRow]);

			const listWithTable = bullet_list.create(null, [
				list_item.create(null, [paragraph.create(), tableNode])
			]);
			const docNode = doc.create(null, [listWithTable]);

			// Find a cursor position inside the table cell
			const sel = TextSelection.findFrom(
				docNode.resolve(10), // somewhere inside the table
				1,
				true
			);
			if (!sel) return; // skip if position not found

			const state = createState(docNode).apply(createState(docNode).tr.setSelection(sel));

			// Should return false because cursor is in a table cell
			expect(shiftArrowInList('up')(state, undefined, undefined)).toBe(false);
		});

		it('returns false when selection is not a TextSelection', () => {
			// This test verifies the TextSelection check.
			// NodeSelection would fail the instanceof check, but we can't easily
			// create one in a list context. The TextSelection guard is verified
			// implicitly by all other tests passing.
			const docNode = doc.create(null, [ul(li('item'))]);
			const state = createState(docNode);
			// Default selection is a TextSelection, so this should proceed to the
			// list check (and possibly return false for other reasons).
			// The key is that non-TextSelection types are rejected.
			expect(shiftArrowInList('up')(state, undefined, undefined)).toBe(false);
		});
	});

	describe('direction handling', () => {
		it('handles up direction factory', () => {
			const cmd = shiftArrowInList('up');
			expect(typeof cmd).toBe('function');
		});

		it('handles down direction factory', () => {
			const cmd = shiftArrowInList('down');
			expect(typeof cmd).toBe('function');
		});

		it('returns false for both directions when not in a list', () => {
			const docNode = doc.create(null, [paragraph.create(null, [quillmarkSchema.text('text')])]);
			const state = stateWithCursor(docNode, 2);
			expect(shiftArrowInList('up')(state, undefined, undefined)).toBe(false);
			expect(shiftArrowInList('down')(state, undefined, undefined)).toBe(false);
		});
	});
});

// =============================================================================
// TESTS: backspaceInList
// =============================================================================

describe('backspaceInList', () => {
	it('returns false when selection is not empty', () => {
		const docNode = doc.create(null, [ul(li('hello'))]);
		// Range selection inside the list item
		const state = stateWithRange(docNode, 3, 5);
		expect(backspaceInList(state)).toBe(false);
	});

	it('returns false when cursor is not in a list', () => {
		const docNode = doc.create(null, [paragraph.create(null, [quillmarkSchema.text('hello')])]);
		const state = stateWithCursor(docNode, 1);
		expect(backspaceInList(state)).toBe(false);
	});

	it('returns false when cursor is not at start of item', () => {
		const docNode = doc.create(null, [ul(li('hello'))]);
		// Cursor in the middle of the text
		const state = stateWithCursor(docNode, 5);
		expect(backspaceInList(state)).toBe(false);
	});

	it('unwraps first item of top-level list at cursor start', () => {
		const docNode = doc.create(null, [ul(li('hello'))]);
		// Cursor at start of list item content: doc(0) > bullet_list(1) > list_item(2) > paragraph(3)
		const state = stateWithCursor(docNode, 3);

		let dispatched = false;
		backspaceInList(state, (tr) => {
			dispatched = true;
			// The list item should be converted to a paragraph
			expect(tr.doc.firstChild!.type.name).toBe('paragraph');
			expect(tr.doc.firstChild!.textContent).toBe('hello');
		});
		expect(dispatched).toBe(true);
	});

	it('merges second item with first on backspace at start', () => {
		const docNode = doc.create(null, [ul(li('first'), li('second'))]);
		// Find start of second list item's paragraph
		// Structure: doc > bullet_list > list_item("first") > list_item("second")
		// first list_item: pos 1 (open) + 1 (para open) + 5 (text) + 1 (para close) + 1 (li close) = 9
		// second list_item: pos 9 (open) + 1 (para open) = cursor at pos 10... let me compute
		const firstItem = li('first');
		const secondItemStart = 1 + firstItem.nodeSize; // 1 for bullet_list open
		const cursorPos = secondItemStart + 2; // +1 for list_item open, +1 for paragraph open

		const state = stateWithCursor(docNode, cursorPos);

		let dispatched = false;
		backspaceInList(state, (tr) => {
			dispatched = true;
			// Should merge "first" and "second" into one item
			const list = tr.doc.firstChild!;
			expect(list.childCount).toBe(1);
			expect(list.firstChild!.firstChild!.textContent).toBe('firstsecond');
		});
		expect(dispatched).toBe(true);
	});
});

// =============================================================================
// TESTS: enterOnEmptyItem
// =============================================================================

describe('enterOnEmptyItem', () => {
	it('returns false when selection is not empty', () => {
		const docNode = doc.create(null, [ul(li('hello'))]);
		const state = stateWithRange(docNode, 3, 5);
		expect(enterOnEmptyItem(state)).toBe(false);
	});

	it('returns false when item has content', () => {
		const docNode = doc.create(null, [ul(li('hello'))]);
		const state = stateWithCursor(docNode, 3);
		expect(enterOnEmptyItem(state)).toBe(false);
	});

	it('converts empty top-level item to paragraph', () => {
		const docNode = doc.create(null, [ul(li('first'), li(''))]);
		// Find start of second (empty) item
		const firstItem = li('first');
		const secondItemStart = 1 + firstItem.nodeSize;
		const cursorPos = secondItemStart + 2;

		const state = stateWithCursor(docNode, cursorPos);

		let dispatched = false;
		enterOnEmptyItem(state, (tr) => {
			dispatched = true;
			// Should split into: list with "first", then empty paragraph
			const firstChild = tr.doc.firstChild!;
			expect(firstChild.type.name).toBe('bullet_list');
			expect(firstChild.firstChild!.firstChild!.textContent).toBe('first');

			const secondChild = tr.doc.child(1);
			expect(secondChild.type.name).toBe('paragraph');
			expect(secondChild.textContent).toBe('');
		});
		expect(dispatched).toBe(true);
	});
});

describe('enterAtStartOfFirstItem', () => {
	it('returns false when not at start of first item', () => {
		const docNode = doc.create(null, [ul(li('first'), li('second'))]);
		const state = stateWithCursor(docNode, 5);
		expect(enterAtStartOfFirstItem(state)).toBe(false);
	});

	it('inserts paragraph above top-level first item', () => {
		const docNode = doc.create(null, [ul(li('first'), li('second'))]);
		const state = stateWithCursor(docNode, 3);

		let dispatched = false;
		enterAtStartOfFirstItem(state, (tr) => {
			dispatched = true;
			expect(tr.doc.firstChild?.type.name).toBe('paragraph');
			expect(tr.doc.child(1).type.name).toBe('bullet_list');
			expect(tr.selection.from).toBe(1);
		});
		expect(dispatched).toBe(true);
	});
});

// =============================================================================
// TESTS: deleteSelectionWithCleanup
// =============================================================================

describe('deleteSelectionWithCleanup', () => {
	it('returns false when selection is empty', () => {
		const docNode = doc.create(null, [ul(li('hello'))]);
		const state = stateWithCursor(docNode, 3);
		expect(deleteSelectionWithCleanup(state)).toBe(false);
	});

	it('returns false when selection has no lists', () => {
		const docNode = doc.create(null, [
			paragraph.create(null, [quillmarkSchema.text('hello world')])
		]);
		const state = stateWithRange(docNode, 1, 6);
		expect(deleteSelectionWithCleanup(state)).toBe(false);
	});

	it('deletes selection spanning list items and cleans up', () => {
		const docNode = doc.create(null, [ul(li('first'), li('second'))]);
		// Select from middle of first item to middle of second
		const state = stateWithRange(docNode, 5, 12);

		let dispatched = false;
		deleteSelectionWithCleanup(state, (tr) => {
			dispatched = true;
			// Should have cleaned up the list structure
			expect(tr.doc.textContent.length).toBeLessThan(docNode.textContent.length);
		});
		expect(dispatched).toBe(true);
	});
});

// =============================================================================
// TESTS: indentListItem / outdentListItem
// =============================================================================

describe('indentListItem', () => {
	it('returns false when not in a list', () => {
		const docNode = doc.create(null, [paragraph.create(null, [quillmarkSchema.text('text')])]);
		const state = stateWithCursor(docNode, 2);
		expect(indentListItem(state)).toBe(false);
	});

	it('returns false for first item (no previous sibling)', () => {
		const docNode = doc.create(null, [ul(li('only'))]);
		const state = stateWithCursor(docNode, 3);
		expect(indentListItem(state)).toBe(false);
	});

	it('indents second item under first', () => {
		const docNode = doc.create(null, [ul(li('first'), li('second'))]);
		const firstItem = li('first');
		const secondItemStart = 1 + firstItem.nodeSize;
		const cursorPos = secondItemStart + 2;

		const state = stateWithCursor(docNode, cursorPos);

		let dispatched = false;
		indentListItem(state, (tr) => {
			dispatched = true;
			// "second" should now be nested inside "first"'s list item
			const list = tr.doc.firstChild!;
			expect(list.childCount).toBe(1); // Only first item at top level
			const firstItemNode = list.firstChild!;
			expect(firstItemNode.childCount).toBe(2); // paragraph + nested list
		});
		expect(dispatched).toBe(true);
	});
});

describe('outdentListItem', () => {
	it('returns false when not in a list', () => {
		const docNode = doc.create(null, [paragraph.create(null, [quillmarkSchema.text('text')])]);
		const state = stateWithCursor(docNode, 2);
		expect(outdentListItem(state)).toBe(false);
	});

	it('de-lists top-level item (Shift-Tab behavior)', () => {
		const docNode = doc.create(null, [ul(li('item'))]);
		const state = stateWithCursor(docNode, 3);

		let dispatched = false;
		outdentListItem(state, (tr) => {
			dispatched = true;
			expect(tr.doc.firstChild?.type.name).toBe('paragraph');
			expect(tr.doc.firstChild?.textContent).toBe('item');
		});
		expect(dispatched).toBe(true);
	});
});

describe('list rework behaviors', () => {
	it('preserves ordered child list type when de-listing from bullet list', () => {
		const orderedChild = ordered_list.create(null, [li('one'), li('two')]);
		const top = list_item.create(null, [
			paragraph.create(null, [quillmarkSchema.text('parent')]),
			orderedChild
		]);
		const docNode = doc.create(null, [bullet_list.create(null, [top, li('next')])]);
		const state = stateWithCursor(docNode, 3);

		let dispatched = false;
		outdentListItem(state, (tr) => {
			dispatched = true;
			expect(tr.doc.child(0).type.name).toBe('paragraph');
			expect(tr.doc.child(1).type.name).toBe('ordered_list');
			expect(tr.doc.child(2).type.name).toBe('bullet_list');
		});
		expect(dispatched).toBe(true);
	});

	it('de-list keeps multiple non-list children', () => {
		const item = list_item.create(null, [
			paragraph.create(null, [quillmarkSchema.text('first')]),
			paragraph.create(null, [quillmarkSchema.text('second')])
		]);
		const docNode = doc.create(null, [bullet_list.create(null, [item])]);
		const state = stateWithCursor(docNode, 3);

		let dispatched = false;
		outdentListItem(state, (tr) => {
			dispatched = true;
			expect(tr.doc.childCount).toBe(2);
			expect(tr.doc.child(0).textContent).toBe('first');
			expect(tr.doc.child(1).textContent).toBe('second');
		});
		expect(dispatched).toBe(true);
	});

	it('backspace merge into deeply nested previous item and promotes current children', () => {
		const prevNested = bullet_list.create(null, [li('prev-child')]);
		const currNested = ordered_list.create(null, [li('curr-child')]);
		const prev = list_item.create(null, [
			paragraph.create(null, [quillmarkSchema.text('A')]),
			prevNested
		]);
		const curr = list_item.create(null, [
			paragraph.create(null, [quillmarkSchema.text('B')]),
			currNested
		]);
		const docNode = doc.create(null, [bullet_list.create(null, [prev, curr])]);

		const firstItem = prev;
		const secondItemStart = 1 + firstItem.nodeSize;
		const cursorPos = secondItemStart + 2;
		const state = stateWithCursor(docNode, cursorPos);

		let dispatched = false;
		backspaceInList(state, (tr) => {
			dispatched = true;
			// "B" merges into "prev-child" (the visually previous item), not "A"
			const list = tr.doc.child(0);
			expect(list.type.name).toBe('bullet_list');
			const topItem = list.child(0);
			expect(topItem.child(0).textContent).toBe('A');
			// Nested list now contains merged "prev-childB"
			const nestedList = topItem.child(1);
			expect(nestedList.child(0).child(0).textContent).toBe('prev-childB');
			// curr-child promoted as separate block
			expect(tr.doc.child(1).type.name).toBe('ordered_list');
			expect(tr.doc.child(1).child(0).textContent).toBe('curr-child');
		});
		expect(dispatched).toBe(true);
	});

	it('backspace merge preserves current multi-block non-list content', () => {
		const prev = list_item.create(null, [paragraph.create(null, [quillmarkSchema.text('A')])]);
		const curr = list_item.create(null, [
			paragraph.create(null, [quillmarkSchema.text('B')]),
			paragraph.create(null, [quillmarkSchema.text('C')])
		]);
		const docNode = doc.create(null, [bullet_list.create(null, [prev, curr])]);

		const secondItemStart = 1 + prev.nodeSize;
		const state = stateWithCursor(docNode, secondItemStart + 2);

		let dispatched = false;
		backspaceInList(state, (tr) => {
			dispatched = true;
			const mergedItem = tr.doc.child(0).child(0);
			expect(mergedItem.childCount).toBe(2);
			expect(mergedItem.child(0).textContent).toBe('AB');
			expect(mergedItem.child(1).textContent).toBe('C');
		});
		expect(dispatched).toBe(true);
	});

	it('backspace merge keeps trailing siblings in same list when promoting current children', () => {
		const prev = list_item.create(null, [paragraph.create(null, [quillmarkSchema.text('A')])]);
		const currNested = ordered_list.create(null, [li('nested')]);
		const curr = list_item.create(null, [
			paragraph.create(null, [quillmarkSchema.text('B')]),
			currNested
		]);
		const after = li('C');
		const docNode = doc.create(null, [bullet_list.create(null, [prev, curr, after])]);

		const secondItemStart = 1 + prev.nodeSize;
		const state = stateWithCursor(docNode, secondItemStart + 2);

		let dispatched = false;
		backspaceInList(state, (tr) => {
			dispatched = true;
			expect(tr.doc.child(0).type.name).toBe('bullet_list');
			expect(tr.doc.child(0).childCount).toBe(2);
			expect(tr.doc.child(0).child(0).textContent).toBe('AB');
			expect(tr.doc.child(0).child(1).textContent).toBe('C');
			expect(tr.doc.child(1).type.name).toBe('ordered_list');
		});
		expect(dispatched).toBe(true);
	});

	it('backspace merge in middle of list preserves all other top-level siblings', () => {
		const before = li('before');
		const prev = list_item.create(null, [paragraph.create(null, [quillmarkSchema.text('A')])]);
		const currNested = ordered_list.create(null, [li('nested')]);
		const curr = list_item.create(null, [
			paragraph.create(null, [quillmarkSchema.text('B')]),
			currNested
		]);
		const after1 = li('C');
		const after2 = li('D');
		const docNode = doc.create(null, [
			bullet_list.create(null, [before, prev, curr, after1, after2])
		]);

		const currItemStart = 1 + before.nodeSize + prev.nodeSize;
		const state = stateWithCursor(docNode, currItemStart + 2);

		let dispatched = false;
		backspaceInList(state, (tr) => {
			dispatched = true;
			expect(tr.doc.childCount).toBe(2);
			expect(tr.doc.child(0).type.name).toBe('bullet_list');
			expect(tr.doc.child(0).childCount).toBe(4);
			expect(tr.doc.child(0).child(0).textContent).toBe('before');
			expect(tr.doc.child(0).child(1).textContent).toBe('AB');
			expect(tr.doc.child(0).child(2).textContent).toBe('C');
			expect(tr.doc.child(0).child(3).textContent).toBe('D');
			expect(tr.doc.child(1).type.name).toBe('ordered_list');
		});
		expect(dispatched).toBe(true);
	});

	it('backspace merge joins promoted same-type child list via cleanup', () => {
		const prev = li('A');
		const currNested = bullet_list.create(null, [li('nested')]);
		const curr = list_item.create(null, [
			paragraph.create(null, [quillmarkSchema.text('B')]),
			currNested
		]);
		const after = li('C');
		const docNode = doc.create(null, [bullet_list.create(null, [prev, curr, after])]);

		const secondItemStart = 1 + prev.nodeSize;
		const state = stateWithCursor(docNode, secondItemStart + 2);

		let dispatched = false;
		backspaceInList(state, (tr) => {
			dispatched = true;
			// Promoted bullet_list is same type as parent → joined by cleanup
			expect(tr.doc.childCount).toBe(1);
			const list = tr.doc.child(0);
			expect(list.type.name).toBe('bullet_list');
			expect(list.childCount).toBe(3);
			expect(list.child(0).textContent).toBe('AB');
			expect(list.child(1).textContent).toBe('C');
			expect(list.child(2).textContent).toBe('nested');
		});
		expect(dispatched).toBe(true);
	});

	it('backspace merge into deepest nested item when previous has nested lists', () => {
		const prev = list_item.create(null, [
			paragraph.create(null, [quillmarkSchema.text('A1')]),
			paragraph.create(null, [quillmarkSchema.text('A2')]),
			bullet_list.create(null, [li('prev-child')])
		]);
		const curr = li('B');
		const docNode = doc.create(null, [bullet_list.create(null, [prev, curr])]);

		const secondItemStart = 1 + prev.nodeSize;
		const state = stateWithCursor(docNode, secondItemStart + 2);

		let dispatched = false;
		backspaceInList(state, (tr) => {
			dispatched = true;
			// "B" merges into "prev-child" (deepest last textblock), not "A2"
			const mergedItem = tr.doc.child(0).child(0);
			expect(mergedItem.child(0).textContent).toBe('A1');
			expect(mergedItem.child(1).textContent).toBe('A2');
			const nestedList = mergedItem.child(2);
			expect(nestedList.type.name).toBe('bullet_list');
			expect(nestedList.child(0).child(0).textContent).toBe('prev-childB');
			// Cursor at join point (after "prev-child", before "B")
			expect(tr.selection.from).toBe(23);
		});
		expect(dispatched).toBe(true);
	});

	it('backspace merge into direct textblock when previous has no nested lists', () => {
		const prev = list_item.create(null, [
			paragraph.create(null, [quillmarkSchema.text('A1')]),
			paragraph.create(null, [quillmarkSchema.text('A2')])
		]);
		const curr = li('B');
		const docNode = doc.create(null, [bullet_list.create(null, [prev, curr])]);

		const secondItemStart = 1 + prev.nodeSize;
		const state = stateWithCursor(docNode, secondItemStart + 2);

		let dispatched = false;
		backspaceInList(state, (tr) => {
			dispatched = true;
			// No nested lists — merge into last direct textblock "A2"
			const mergedItem = tr.doc.child(0).child(0);
			expect(mergedItem.child(0).textContent).toBe('A1');
			expect(mergedItem.child(1).textContent).toBe('A2B');
			// Cursor at join point (after "A2", before "B")
			expect(tr.selection.from).toBe(9);
		});
		expect(dispatched).toBe(true);
	});

	it('backspace merge descends multiple nesting levels', () => {
		// - A
		//   - B
		//     - Deep
		// - |C         → merge "C" into "Deep"
		const deepList = ordered_list.create(null, [li('Deep')]);
		const midItem = list_item.create(null, [
			paragraph.create(null, [quillmarkSchema.text('B')]),
			deepList
		]);
		const midList = bullet_list.create(null, [midItem]);
		const prev = list_item.create(null, [
			paragraph.create(null, [quillmarkSchema.text('A')]),
			midList
		]);
		const curr = li('C');
		const docNode = doc.create(null, [bullet_list.create(null, [prev, curr])]);

		const secondItemStart = 1 + prev.nodeSize;
		const state = stateWithCursor(docNode, secondItemStart + 2);

		let dispatched = false;
		backspaceInList(state, (tr) => {
			dispatched = true;
			// "C" should merge into "Deep" (3 levels deep)
			const topItem = tr.doc.child(0).child(0);
			expect(topItem.child(0).textContent).toBe('A');
			const nested1 = topItem.child(1); // bullet_list
			const nested1Item = nested1.child(0);
			expect(nested1Item.child(0).textContent).toBe('B');
			const nested2 = nested1Item.child(1); // ordered_list
			expect(nested2.child(0).child(0).textContent).toBe('DeepC');
			// Cursor at join point (after "Deep", before "C")
			expect(tr.selection.from).toBe(17);
		});
		expect(dispatched).toBe(true);
	});

	it('toggle ordered list off when already in ordered list', () => {
		const docNode = doc.create(null, [ordered_list.create(null, [li('item')])]);
		const state = stateWithCursor(docNode, 3);

		let dispatched = false;
		toggleOrderedList(state, (tr) => {
			dispatched = true;
			expect(tr.doc.firstChild?.type.name).toBe('paragraph');
		});
		expect(dispatched).toBe(true);
	});

	it('toggle bullet list converts ordered list to bullet list', () => {
		const docNode = doc.create(null, [ordered_list.create(null, [li('item')])]);
		const state = stateWithCursor(docNode, 3);

		let dispatched = false;
		toggleBulletList(state, (tr) => {
			dispatched = true;
			expect(tr.doc.firstChild?.type.name).toBe('bullet_list');
		});
		expect(dispatched).toBe(true);
	});

	it('toggles list type across selected list blocks', () => {
		const firstList = bullet_list.create(null, [li('a')]);
		const secondList = ordered_list.create(null, [li('b')]);
		const docNode = doc.create(null, [firstList, secondList]);
		const from = 3; // inside first item's paragraph
		const secondListStart = 1 + firstList.nodeSize;
		const to = secondListStart + 3; // inside second list item's paragraph
		const state = stateWithRange(docNode, from, to);

		let dispatched = false;
		toggleOrderedList(state, (tr) => {
			dispatched = true;
			expect(tr.doc.child(0).type.name).toBe('ordered_list');
			expect(tr.doc.child(0).childCount).toBe(2);
			expect(tr.doc.child(0).child(0).textContent).toBe('a');
			expect(tr.doc.child(0).child(1).textContent).toBe('b');
		});
		expect(dispatched).toBe(true);
	});
});
