/**
 * Extended markdown serializer for QuillMark documents.
 *
 * Uses prosemirror-markdown's defaultMarkdownSerializer as foundation,
 * extending only with QuillMark-specific nodes and marks:
 * - inline_metadata node → --- ... ---
 * - underline mark → <u>text</u>
 */

import { MarkdownSerializer, defaultMarkdownSerializer } from 'prosemirror-markdown';
import type { MarkdownSerializerState } from 'prosemirror-markdown';
import type { Node } from 'prosemirror-model';

// Augment prosemirror-markdown to expose the de-facto-public internals used by
// custom serializers. Both fields have existed since prosemirror-markdown 1.0
// and are the canonical mechanism for controlling inter-block whitespace.
declare module 'prosemirror-markdown' {
	interface MarkdownSerializerState {
		closed?: Node;
		flushClose(n: number): void;
	}
}

// =============================================================================
// Node serialization
// =============================================================================

// If the previous block was also a list, force a tight transition so adjacent
// lists don't get a blank line inserted between them.
function forceTightListTransition(state: MarkdownSerializerState) {
	if (
		state.closed &&
		(state.closed.type.name === 'bullet_list' || state.closed.type.name === 'ordered_list')
	) {
		state.flushClose(1);
	}
}

/**
 * Extend default node serializers with QuillMark custom nodes.
 */
const nodes = {
	// Inherit all default node serializers
	...defaultMarkdownSerializer.nodes,

	// Table serialization → pipe-table markdown
	table(state: MarkdownSerializerState, node: Node) {
		// Collect all rows and find the widths
		const rows: string[][] = [];
		const isHeader: boolean[] = [];

		node.forEach((row) => {
			const cells: string[] = [];
			let rowIsHeader = false;
			row.forEach((cell) => {
				// Serialize cell content inline (no trailing newline)
				const content = cell.textContent || '';
				cells.push(content);
				if (cell.type.name === 'table_header') {
					rowIsHeader = true;
				}
			});
			rows.push(cells);
			isHeader.push(rowIsHeader);
		});

		if (rows.length === 0) return;

		// Calculate column widths
		const numCols = Math.max(...rows.map((r) => r.length));
		const colWidths: number[] = [];
		for (let c = 0; c < numCols; c++) {
			let maxWidth = 3; // minimum "---"
			for (const row of rows) {
				if (c < row.length) {
					maxWidth = Math.max(maxWidth, row[c].length);
				}
			}
			colWidths.push(maxWidth);
		}

		// Write header row
		if (rows.length > 0 && isHeader[0]) {
			const headerCells = rows[0].map((cell, c) => ` ${cell.padEnd(colWidths[c])} `);
			state.write('|' + headerCells.join('|') + '|');
			state.ensureNewLine();

			// Write separator row
			const separators = colWidths.map((w) => '-'.repeat(w + 2));
			state.write('|' + separators.join('|') + '|');
			state.ensureNewLine();

			// Write body rows
			for (let r = 1; r < rows.length; r++) {
				const bodyCells = rows[r].map((cell, c) => ` ${cell.padEnd(colWidths[c])} `);
				state.write('|' + bodyCells.join('|') + '|');
				state.ensureNewLine();
			}
		} else {
			// No header row — write all as body
			for (const row of rows) {
				const bodyCells = row.map((cell, c) => ` ${cell.padEnd(colWidths[c])} `);
				state.write('|' + bodyCells.join('|') + '|');
				state.ensureNewLine();
			}
		}

		state.closeBlock(node);
	},
	table_row() {
		// Handled by table serializer
	},
	table_cell() {
		// Handled by table serializer
	},
	table_header() {
		// Handled by table serializer
	},

	// QuillMark extensions
	inline_metadata(state: MarkdownSerializerState, node: Node) {
		state.write('---\n');
		state.write(node.attrs.content || '');
		state.ensureNewLine();
		state.write('---');
		state.closeBlock(node);
	},

	// Force tight lists and set bullet marker preference
	bullet_list(state: MarkdownSerializerState, node: Node) {
		forceTightListTransition(state);

		const tightNode = node.type.create({ ...node.attrs, tight: true }, node.content, node.marks);
		state.renderList(tightNode, '  ', () => (node.attrs.bullet || '-') + ' ');

		state.closeBlock(node);
	},

	ordered_list(state: MarkdownSerializerState, node: Node) {
		forceTightListTransition(state);

		const tightNode = node.type.create({ ...node.attrs, tight: true }, node.content, node.marks);
		const start = (node.attrs.order as number) || 1;
		const maxW = String(start + node.childCount - 1).length;
		const space = ' '.repeat(maxW + 2);
		state.renderList(tightNode, space, (i) => {
			const num = String(start + i);
			return ' '.repeat(maxW - num.length) + num + '. ';
		});

		state.closeBlock(node);
	}
};

// =============================================================================
// Mark serialization
// =============================================================================

/**
 * Extend default mark serializers with QuillMark custom marks.
 */
const marks = {
	// Inherit all default mark serializers
	...defaultMarkdownSerializer.marks,

	// QuillMark extensions
	underline: {
		open: '<u>',
		close: '</u>',
		mixable: true,
		expelEnclosingWhitespace: true
	},
	strikethrough: {
		open: '~~',
		close: '~~',
		mixable: true,
		expelEnclosingWhitespace: true
	}
};

// =============================================================================
// Export
// =============================================================================

/**
 * The QuillMark markdown serializer.
 */
export const quillmarkSerializer = new MarkdownSerializer(nodes, marks);

/**
 * Serialize ProseMirror document to markdown.
 */
export function serializeMarkdown(doc: Node): string {
	return quillmarkSerializer.serialize(doc);
}
