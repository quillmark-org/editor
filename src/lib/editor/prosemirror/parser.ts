/**
 * Extended markdown parser for QuillMark documents.
 *
 * Uses prosemirror-markdown's defaultMarkdownParser as foundation,
 * extending only with QuillMark-specific syntax:
 * - Underline: <u>text</u>
 * - Inline metadata blocks: --- delimited YAML
 */

import { MarkdownParser, defaultMarkdownParser } from 'prosemirror-markdown';
import { quillmarkSchema } from './schema';
import { createMarkdownIt, stripMarkdownHtmlComments } from '$lib/parsing';

// =============================================================================
// Markdown-it configuration
// =============================================================================

// =============================================================================
// Parser configuration
// =============================================================================

/**
 * Token specs: extend default parser's tokens with QuillMark custom tokens.
 */
const customTokens = {
	// Inherit all default token mappings
	...defaultMarkdownParser.tokens,

	// Table tokens (from markdown-it table rule)
	table: { block: 'table' },
	thead: { ignore: true },
	tbody: { ignore: true },
	tr: { block: 'table_row' },
	th: { block: 'table_header' },
	td: { block: 'table_cell' },

	// QuillMark extensions
	inline_metadata: {
		node: 'inline_metadata',
		getAttrs: (tok: { content: string }) => ({ content: tok.content })
	},
	underline: { mark: 'underline' },
	strikethrough: { mark: 'strikethrough' }
};

/**
 * The QuillMark markdown parser.
 */
export const quillmarkParser = new MarkdownParser(
	quillmarkSchema,
	createMarkdownIt(),
	customTokens
);

/**
 * Override cell token handlers to wrap inline content in paragraphs.
 *
 * Table cells use cellContent: 'block+' (paragraphs), but markdown-it
 * produces inline content for cells. The default { block: 'table_cell' }
 * spec puts inline content directly in the cell, which fails schema
 * validation (createAndFill returns null) and silently drops the cell.
 *
 * Fix: on cell open, also open a paragraph inside it.
 * On cell close, close the paragraph first, then close the cell.
 */
const paragraphType = quillmarkSchema.nodes.paragraph;
const cellType = quillmarkSchema.nodes.table_cell;
const headerType = quillmarkSchema.nodes.table_header;

// prosemirror-markdown's MarkdownParseState is private; capture only the
// `openNode` / `closeNode` surface our table-cell handlers need.
interface ParseStateLike {
	openNode(type: import('prosemirror-model').NodeType, attrs: Record<string, unknown> | null): void;
	closeNode(): void;
}
const tokenHandlers = (
	quillmarkParser as unknown as { tokenHandlers: Record<string, (state: ParseStateLike) => void> }
).tokenHandlers;

tokenHandlers.td_open = (state) => {
	state.openNode(cellType, {});
	state.openNode(paragraphType, null);
};
tokenHandlers.td_close = (state) => {
	state.closeNode(); // close paragraph
	state.closeNode(); // close table_cell
};
tokenHandlers.th_open = (state) => {
	state.openNode(headerType, {});
	state.openNode(paragraphType, null);
};
tokenHandlers.th_close = (state) => {
	state.closeNode(); // close paragraph
	state.closeNode(); // close table_header
};

/**
 * Parse markdown content to ProseMirror document.
 * Falls back to a plain text paragraph if parsing fails.
 *
 * The fallback flattens structure (headings, lists, tables → plain text),
 * which means the next serialize round-trip will permanently lose that
 * structure. Callers can pass `onFallback` to surface the degradation in
 * the UI rather than letting it pass silently.
 */
export function parseMarkdown(content: string, onFallback?: (error: unknown) => void) {
	const normalizedContent = stripMarkdownHtmlComments(content);

	try {
		return quillmarkParser.parse(normalizedContent);
	} catch (error) {
		// Graceful degradation: create a document with the raw content as plain text
		console.error('Failed to parse markdown, falling back to plain text:', error);
		onFallback?.(error);

		// Create a minimal valid document with a paragraph containing the raw content
		return quillmarkSchema.node('doc', null, [
			quillmarkSchema.node(
				'paragraph',
				null,
				normalizedContent ? [quillmarkSchema.text(normalizedContent)] : []
			)
		]);
	}
}
