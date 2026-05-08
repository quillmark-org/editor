/**
 * Theme classes wired to the Lexical editor. Class names map to CSS rules in
 * `BodyEditor.svelte`'s scoped styles (under `.lexical-container`).
 */

import type { EditorThemeClasses } from 'lexical';

export const quillmarkTheme: EditorThemeClasses = {
	paragraph: 'qm-paragraph',
	heading: {
		h1: 'qm-h1',
		h2: 'qm-h2',
		h3: 'qm-h3',
		h4: 'qm-h4',
		h5: 'qm-h5',
		h6: 'qm-h6'
	},
	quote: 'qm-quote',
	code: 'qm-code-block',
	codeHighlight: {},
	list: {
		nested: { listitem: 'qm-nested-listitem' },
		ol: 'qm-ol',
		ul: 'qm-ul',
		listitem: 'qm-li'
	},
	link: 'qm-link',
	text: {
		bold: 'qm-text-bold',
		italic: 'qm-text-italic',
		underline: 'qm-text-underline',
		strikethrough: 'qm-text-strikethrough',
		underlineStrikethrough: 'qm-text-underline-strikethrough',
		code: 'qm-text-code'
	},
	table: 'qm-table',
	tableRow: 'qm-table-row',
	tableCell: 'qm-table-cell',
	tableCellHeader: 'qm-table-cell-header'
};
