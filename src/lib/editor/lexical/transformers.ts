/**
 * Markdown transformers for the QuillMark Lexical editor.
 *
 * Built on top of @lexical/markdown's TRANSFORMERS, with custom additions:
 * - UNDERLINE text-format transformer (<u>text</u>)
 * - INLINE_METADATA multiline-element transformer (--- ... --- blocks)
 *
 * Strikethrough (~~~~), bold/italic, inline code, links, headings, lists, code
 * blocks, and quotes are inherited from @lexical/markdown's defaults.
 */

import {
	TRANSFORMERS,
	type MultilineElementTransformer,
	type TextFormatTransformer,
	type Transformer
} from '@lexical/markdown';
import type { ElementNode, LexicalNode } from 'lexical';

import {
	$createInlineMetadataNode,
	$isInlineMetadataNode,
	InlineMetadataNode
} from './inline-metadata-node';

/**
 * Underline (<u>text</u>) — Lexical's text-format machinery already supports
 * an `underline` format flag, so we just need a transformer that wires the
 * `<u>...</u>` syntax up to it.
 */
export const UNDERLINE: TextFormatTransformer = {
	format: ['underline'],
	tag: '<u>',
	type: 'text-format'
};

/**
 * Inline metadata block:
 *
 *   ---
 *   key: value
 *   ---
 *
 * Stored verbatim in an InlineMetadataNode and rendered as a thin gradient
 * separator. Note: HR is not in @lexical/markdown's default transformer set,
 * so `---` lines are unambiguously inline-metadata in our editor.
 */
export const INLINE_METADATA: MultilineElementTransformer = {
	dependencies: [InlineMetadataNode],
	regExpStart: /^---\s*$/,
	regExpEnd: /^---\s*$/,
	replace: (
		rootNode: ElementNode,
		_children: Array<LexicalNode> | null,
		_startMatch: Array<string>,
		_endMatch: Array<string> | null,
		linesInBetween: Array<string> | null,
		isImport: boolean
	) => {
		// Markdown shortcut path (typing): we don't auto-create metadata blocks
		// from typed `---` to avoid surprising the user.
		if (!isImport) return false;
		const content = (linesInBetween ?? []).join('\n').trim();
		rootNode.append($createInlineMetadataNode(content));
		return true;
	},
	export: (node: LexicalNode) => {
		if (!$isInlineMetadataNode(node)) return null;
		const body = node.getContent();
		return body ? `---\n${body}\n---` : `---\n---`;
	},
	type: 'multiline-element'
};

/**
 * Combined transformer set used for both import and export.
 * Order matters: more specific transformers should come first.
 */
export const QUILLMARK_TRANSFORMERS: Array<Transformer> = [
	INLINE_METADATA,
	...TRANSFORMERS,
	UNDERLINE
];

