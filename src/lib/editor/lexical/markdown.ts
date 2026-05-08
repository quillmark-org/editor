/**
 * Thin wrappers around @lexical/markdown's import/export entry points,
 * pre-bound to QUILLMARK_TRANSFORMERS.
 *
 * Exposes a `parseMarkdownInto(editor, markdown, onFallback?)` that mirrors
 * the legacy ProseMirror parser's fallback-on-error behaviour.
 */

import {
	$convertFromMarkdownString,
	$convertToMarkdownString
} from '@lexical/markdown';
import { $getRoot, $createParagraphNode, $createTextNode, type LexicalEditor } from 'lexical';

import { QUILLMARK_TRANSFORMERS } from './transformers';

/**
 * Pre-process markdown so Lexical's TextFormatTransformer can recognise our
 * underline tags as a symmetric pair. The transformer uses a single `tag`
 * string for both delimiters, which mismatches HTML's `<u>...</u>`. We
 * normalise on the way in and restore on the way out (see
 * `postprocessExportedMarkdown`). Standalone `<u>` / `</u>` tags (unpaired)
 * are left alone so they survive as literal text.
 */
function preprocessImportedMarkdown(markdown: string): string {
	return markdown.replace(/<u>([\s\S]*?)<\/u>/gi, '<u>$1<u>');
}

function postprocessExportedMarkdown(markdown: string): string {
	let out = '';
	let inU = false;
	let i = 0;
	while (i < markdown.length) {
		if (markdown.startsWith('<u>', i)) {
			out += inU ? '</u>' : '<u>';
			inU = !inU;
			i += 3;
		} else {
			out += markdown[i];
			i += 1;
		}
	}
	// Unbalanced trailing `<u>` — leave it; the next round-trip will repair.
	return out;
}

/**
 * Replace the editor's contents with the parsed markdown. If parsing throws
 * (or yields an unexpected empty doc with non-empty input), populates the
 * root with the raw markdown as a single paragraph and invokes `onFallback`.
 */
export function parseMarkdownInto(
	editor: LexicalEditor,
	markdown: string,
	onFallback?: (error: unknown) => void
): void {
	editor.update(
		() => {
			try {
				$convertFromMarkdownString(
					preprocessImportedMarkdown(markdown ?? ''),
					QUILLMARK_TRANSFORMERS,
					undefined,
					/*shouldPreserveNewLines*/ false,
					/*shouldMergeAdjacentLines*/ true
				);
			} catch (error) {
				const root = $getRoot();
				root.clear();
				const paragraph = $createParagraphNode();
				if (markdown) {
					paragraph.append($createTextNode(markdown));
				}
				root.append(paragraph);
				onFallback?.(error);
			}
		},
		{ discrete: true, tag: 'history-merge' }
	);
}

/**
 * Serialize the current editor state to markdown using the QuillMark
 * transformer set. Must be invoked from inside an `editor.read()` /
 * `editor.update()` callback (or via `editor.getEditorState().read(...)`).
 */
export function $serializeToMarkdown(): string {
	return postprocessExportedMarkdown($convertToMarkdownString(QUILLMARK_TRANSFORMERS));
}

export function readMarkdown(editor: LexicalEditor): string {
	return editor.getEditorState().read(() => $serializeToMarkdown());
}
