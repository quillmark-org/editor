/**
 * ProseMirror keymap for QuillMark editor.
 */

import {
	toggleMark,
	chainCommands,
	deleteSelection,
	joinBackward,
	joinForward,
	selectNodeBackward,
	selectNodeForward,
	liftEmptyBlock,
	createParagraphNear,
	selectAll,
	splitBlock
} from 'prosemirror-commands';
import { undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { type Command } from 'prosemirror-state';
import { splitListItem } from 'prosemirror-schema-list';
import { goToNextCell } from 'prosemirror-tables';
import { quillmarkSchema } from './schema';
import {
	enterOnEmptyItem,
	enterAtStartOfFirstItem,
	backspaceInList,
	joinParagraphIntoList,
	deleteSelectionWithCleanup,
	indentListItem,
	outdentListItem,
	shiftArrowInList
} from './list-commands';
import {
	deleteSelectedRowsColumns,
	convertPipeRowToTable,
	goToCellBelow,
	selectAllInCell,
	arrowOutOfTable
} from './table-commands';

export interface KeymapCallbacks {
	onModeSwitch?: () => void;
	onToggleMetadata?: () => void;
}

const trapTab: Command = () => true;

export function createQuillmarkKeymap(callbacks: KeymapCallbacks) {
	const { marks, nodes } = quillmarkSchema;

	const bindings: Record<string, Command> = {
		// Formatting
		'Mod-b': toggleMark(marks.strong),
		'Mod-i': toggleMark(marks.em),
		'Mod-u': toggleMark(marks.underline),

		// History
		'Mod-z': undo,
		'Mod-Shift-z': redo,
		'Mod-y': redo,

		// Select all: cell-scoped if inside a table, otherwise whole document
		'Mod-a': chainCommands(selectAllInCell, selectAll),

		// Arrow keys: gap cursor between adjacent tables (must precede tableEditing handler)
		ArrowDown: arrowOutOfTable('down'),
		ArrowUp: arrowOutOfTable('up'),

		// Shift+Arrow: controlled selection extension across list item boundaries
		// (prevents browser overshoot when extending selection through list items)
		'Shift-ArrowUp': shiftArrowInList('up'),
		'Shift-ArrowDown': shiftArrowInList('down'),

		// Tab: Table cell navigation (takes priority), then list indentation
		Tab: chainCommands(goToNextCell(1), indentListItem, trapTab),
		// Shift-Tab: table nav first, then list outdent.
		// Note: top-level list items now intentionally de-list via outdentListItem,
		// so this command consumes Shift-Tab in list context by design.
		'Shift-Tab': chainCommands(goToNextCell(-1), outdentListItem, trapTab),

		// Backspace chain:
		// 1. Delete selected table rows/columns (must precede tableEditing handler)
		// 2. Delete selection with list cleanup
		// 3. Standard delete selection
		// 4. Custom list backspace (join/unwrap)
		// 5. Join paragraph into preceding list
		// 6. Standard join/select
		Backspace: chainCommands(
			deleteSelectedRowsColumns,
			deleteSelectionWithCleanup,
			deleteSelection,
			backspaceInList,
			joinParagraphIntoList,
			joinBackward,
			selectNodeBackward
		),

		// Delete
		Delete: chainCommands(
			deleteSelectionWithCleanup,
			deleteSelection,
			joinForward,
			selectNodeForward
		),

		// Enter chain:
		// 1. Convert pipe syntax to table (| col1 | col2 |)
		// 2. Table cell: move to cell below (or add row if on last row)
		// 3. Empty item → outdent or exit
		// 4. First item at start → insert paragraph above
		// 5. Standard split item
		// 6. Fallbacks
		Enter: chainCommands(
			convertPipeRowToTable,
			goToCellBelow,
			enterOnEmptyItem,
			enterAtStartOfFirstItem,
			splitListItem(nodes.list_item),
			liftEmptyBlock,
			createParagraphNear,
			splitBlock
		),

		// Shift+Enter: insert soft break (line break within same block)
		'Shift-Enter': (state, dispatch) => {
			const { hard_break } = nodes;
			if (!hard_break) return false;
			if (dispatch) {
				dispatch(state.tr.replaceSelectionWith(hard_break.create()).scrollIntoView());
			}
			return true;
		}
	};

	if (callbacks.onModeSwitch) {
		bindings['Mod-Shift-m'] = () => {
			callbacks.onModeSwitch!();
			return true;
		};
	}

	if (callbacks.onToggleMetadata) {
		bindings['Mod-e'] = () => {
			callbacks.onToggleMetadata!();
			return true;
		};
	}

	return keymap(bindings);
}

export { baseKeymap } from 'prosemirror-commands';
