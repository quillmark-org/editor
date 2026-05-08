/**
 * Factory for constructing a fully wired QuillMark Lexical editor.
 *
 * Returns the editor instance plus a teardown function that unregisters every
 * listener/plugin we attached. Callers own attaching the root element via
 * `editor.setRootElement(...)`.
 */

import { createEditor, type LexicalEditor } from 'lexical';
import { registerRichText, HeadingNode, QuoteNode } from '@lexical/rich-text';
import { registerHistory, createEmptyHistoryState } from '@lexical/history';
import { registerList, ListNode, ListItemNode } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import { CodeNode } from '@lexical/code-core';
import {
	TableCellNode,
	TableNode,
	TableRowNode,
	registerTablePlugin,
	registerTableSelectionObserver
} from '@lexical/table';
import { registerMarkdownShortcuts } from '@lexical/markdown';

import { QUILLMARK_TRANSFORMERS } from './transformers';
import { quillmarkTheme } from './theme';

export interface QuillmarkEditorBundle {
	editor: LexicalEditor;
	dispose: () => void;
}

export function createQuillmarkEditor(options: {
	namespace?: string;
	editable?: boolean;
	onError?: (error: Error) => void;
} = {}): QuillmarkEditorBundle {
	const editor = createEditor({
		namespace: options.namespace ?? 'quillmark',
		editable: options.editable ?? true,
		theme: quillmarkTheme,
		onError: (error) => {
			if (options.onError) {
				options.onError(error);
			} else {
				// eslint-disable-next-line no-console
				console.error('[lexical]', error);
			}
		},
		nodes: [
			// rich-text
			HeadingNode,
			QuoteNode,
			// list
			ListNode,
			ListItemNode,
			// link
			LinkNode,
			// code
			CodeNode,
			// table
			TableNode,
			TableRowNode,
			TableCellNode
		]
	});

	const teardown: Array<() => void> = [];

	teardown.push(registerRichText(editor));
	teardown.push(registerHistory(editor, createEmptyHistoryState(), 1000));
	teardown.push(registerList(editor));
	// LinkNode is registered via the `nodes` array; the auto-link / click
	// behaviour from `registerLink` (extension stores API) is intentionally
	// skipped for the spike. TOGGLE_LINK_COMMAND still works without it.
	teardown.push(registerTablePlugin(editor));
	teardown.push(registerTableSelectionObserver(editor));
	teardown.push(registerMarkdownShortcuts(editor, QUILLMARK_TRANSFORMERS));

	return {
		editor,
		dispose: () => {
			while (teardown.length > 0) {
				const fn = teardown.pop();
				try {
					fn?.();
				} catch (err) {
					// eslint-disable-next-line no-console
					console.warn('[lexical] teardown threw', err);
				}
			}
		}
	};
}
