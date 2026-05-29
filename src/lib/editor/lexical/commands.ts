/**
 * High-level command helpers used by toolbars / external callers. They wrap
 * Lexical's built-in commands with the QuillMark-specific argument shape
 * (e.g. converting our format-type strings into TextFormatType / list
 * commands / link payloads).
 */

import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND, type LexicalEditor } from 'lexical';
import {
	INSERT_ORDERED_LIST_COMMAND,
	INSERT_UNORDERED_LIST_COMMAND,
	REMOVE_LIST_COMMAND,
	$isListNode
} from '@lexical/list';
import { $findMatchingParent } from '@lexical/utils';
import { TOGGLE_LINK_COMMAND } from '@lexical/link';

export type FormatType =
	| 'bold'
	| 'italic'
	| 'underline'
	| 'strikethrough'
	| 'code'
	| 'link'
	| 'bulletList'
	| 'numberedList';

export function applyFormat(editor: LexicalEditor, type: FormatType): void {
	switch (type) {
		case 'bold':
		case 'italic':
		case 'underline':
		case 'strikethrough':
		case 'code':
			editor.dispatchCommand(FORMAT_TEXT_COMMAND, type);
			return;
		case 'link': {
			editor.read(() => {
				const selection = $getSelection();
				if (!$isRangeSelection(selection)) return;
				const nodes = selection.getNodes();
				const hasLink = nodes.some((n) => $findMatchingParent(n, (p) => p.getType() === 'link'));
				if (hasLink) {
					editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
					return;
				}
				const url = window.prompt('Enter URL:');
				if (!url) return;
				editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
			});
			return;
		}
		case 'bulletList':
			toggleListCommand(editor, 'bullet');
			return;
		case 'numberedList':
			toggleListCommand(editor, 'number');
			return;
	}
}

/**
 * Toggle a list type at the current selection. If the selection is already in
 * a list of the requested type, the list is removed; otherwise it is created
 * (or its type swapped).
 */
function toggleListCommand(editor: LexicalEditor, kind: 'bullet' | 'number'): void {
	editor.read(() => {
		const selection = $getSelection();
		if (!$isRangeSelection(selection)) {
			dispatchInsertList(editor, kind);
			return;
		}
		const anchorNode = selection.anchor.getNode();
		const list = $findMatchingParent(anchorNode, (n) => $isListNode(n));
		if (list && $isListNode(list)) {
			const currentKind = list.getListType();
			if (currentKind === kind) {
				editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
				return;
			}
		}
		dispatchInsertList(editor, kind);
	});
}

function dispatchInsertList(editor: LexicalEditor, kind: 'bullet' | 'number'): void {
	editor.dispatchCommand(
		kind === 'bullet' ? INSERT_UNORDERED_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND,
		undefined
	);
}
