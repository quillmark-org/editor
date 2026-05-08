/**
 * Markdown transformers for the QuillMark Lexical editor.
 *
 * Built on top of @lexical/markdown's TRANSFORMERS, with one custom addition:
 * - UNDERLINE text-format transformer (<u>text</u>)
 *
 * Strikethrough (~~~~), bold/italic, inline code, links, headings, lists, code
 * blocks, and quotes are inherited from @lexical/markdown's defaults.
 */

import { TRANSFORMERS, type TextFormatTransformer, type Transformer } from '@lexical/markdown';

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
 * Combined transformer set used for both import and export.
 */
export const QUILLMARK_TRANSFORMERS: Array<Transformer> = [...TRANSFORMERS, UNDERLINE];
