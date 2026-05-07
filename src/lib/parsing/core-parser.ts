/**
 * Shared markdown-it configuration for Extended Markdown.
 *
 * Centralizes the parser setup to ensure consistency between
 * document region detection and editor rendering.
 */

import MarkdownIt from 'markdown-it';

// =============================================================================
// Internal markdown-it plugins
// =============================================================================

/**
 * Underline syntax: <u>text</u>
 */
function underlinePlugin(md: MarkdownIt): void {
	md.inline.ruler.before('emphasis', 'underline', (state, silent) => {
		const start = state.pos;

		if (state.src.slice(start, start + 3) !== '<u>') return false;

		const closeTag = '</u>';
		const end = state.src.indexOf(closeTag, start + 3);
		if (end === -1) return false;
		if (state.src.slice(start + 3, end).includes('\n')) return false;

		if (silent) return true;

		const content = state.src.slice(start + 3, end);
		state.push('underline_open', 'u', 1).markup = '<u>';
		state.push('text', '', 0).content = content;
		state.push('underline_close', 'u', -1).markup = '</u>';
		state.pos = end + closeTag.length;
		return true;
	});
}

/**
 * Strikethrough syntax: ~~text~~
 */
function strikethroughPlugin(md: MarkdownIt): void {
	md.inline.ruler.before('emphasis', 'strikethrough', (state, silent) => {
		const start = state.pos;
		const max = state.posMax;

		if (state.src.charCodeAt(start) !== 0x7e) return false;
		if (state.src.charCodeAt(start + 1) !== 0x7e) return false;
		if (state.src.charCodeAt(start + 2) === 0x7e) return false;

		let end = start + 2;
		while (end < max - 1) {
			if (
				state.src.charCodeAt(end) === 0x7e &&
				state.src.charCodeAt(end + 1) === 0x7e &&
				state.src.charCodeAt(end + 2) !== 0x7e
			) {
				break;
			}
			end++;
		}

		if (end >= max - 1) return false;
		if (silent) return true;

		const content = state.src.slice(start + 2, end);
		state.push('strikethrough_open', 's', 1).markup = '~~';
		state.push('text', '', 0).content = content;
		state.push('strikethrough_close', 's', -1).markup = '~~';
		state.pos = end + 2;
		return true;
	});
}

/**
 * Inline metadata blocks: --- delimited YAML appearing after frontmatter.
 */
function inlineMetadataPlugin(md: MarkdownIt): void {
	md.block.ruler.before('hr', 'inline_metadata', (state, startLine, endLine, silent) => {
		const start = state.bMarks[startLine] + state.tShift[startLine];
		const max = state.eMarks[startLine];

		if (state.src.slice(start, max).trim() !== '---') return false;

		let nextLine = startLine + 1;
		let found = false;

		while (nextLine < endLine) {
			const nextStart = state.bMarks[nextLine] + state.tShift[nextLine];
			const nextMax = state.eMarks[nextLine];
			if (state.src.slice(nextStart, nextMax).trim() === '---') {
				found = true;
				break;
			}
			nextLine++;
		}

		if (!found) return false;
		if (silent) return true;

		const content = state.getLines(startLine + 1, nextLine, 0, false).trim();
		const token = state.push('inline_metadata', 'div', 0);
		token.content = content;
		token.attrs = [['content', content]];
		token.map = [startLine, nextLine + 1];
		state.line = nextLine + 1;
		return true;
	});
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Creates a configured MarkdownIt instance with Extended Markdown extensions.
 *
 * extensions:
 * - CommonMark mode
 * - No HTML, no linkify (consistent with QuillMark needs)
 * - Underline (<u>text</u>)
 * - Strikethrough (~~text~~)
 * - Inline Metadata (--- delimited blocks)
 */
export function createMarkdownIt(): MarkdownIt {
	const md = new MarkdownIt('commonmark', { html: false, linkify: false });
	md.disable(['autolink', 'image', 'hr', 'blockquote', 'html_block', 'lheading']);
	md.enable(['table']);
	md.use(underlinePlugin);
	md.use(strikethroughPlugin);
	md.use(inlineMetadataPlugin);
	return md;
}
