import type { Text } from '@codemirror/state';
import { FENCED_CODE_OPEN_PATTERN, createClosingFencePattern, IDENTIFIER_STR } from '$lib/parsing';

/**
 * Represents a range in the document
 */
export interface Range {
	from: number;
	to: number;
}

/**
 * Represents a metadata block in the document
 */
export interface MetadataBlock {
	from: number; // Start of opening delimiter
	to: number; // End of closing delimiter (or document end if unclosed)
	contentFrom: number; // Start of content (after opening delimiter line)
	contentTo: number; // End of content (before closing delimiter line)
}

/**
 * Represents a CARD or QUILL keyword with its value
 */
export interface CardQuillKeyword {
	from: number;
	to: number;
	keyword: 'CARD' | 'QUILL';
	keywordFrom: number;
	keywordTo: number;
	nameFrom: number;
	nameTo: number;
	name: string;
}

/**
 * Represents a YAML key-value pair
 */
export interface YamlPair {
	keyFrom: number;
	keyTo: number;
	valueFrom: number;
	valueTo: number;
	valueType: 'string' | 'number' | 'boolean' | 'unknown';
	/** YAML tag name without the '!' prefix (e.g., 'fill' for !fill) */
	tag?: string;
	/** Position of '!' character */
	tagFrom?: number;
	/** Position after tag name (before the space separating tag from value) */
	tagTo?: number;
}

/**
 * Represents a YAML comment
 */
export interface YamlComment {
	from: number;
	to: number;
}

/**
 * Represents a markdown bold element
 */
export interface MarkdownBold {
	from: number; // Start of opening delimiter
	to: number; // End of closing delimiter
	delimiterType: '**';
	openDelimiterFrom: number;
	openDelimiterTo: number;
	contentFrom: number;
	contentTo: number;
	closeDelimiterFrom: number;
	closeDelimiterTo: number;
}

/**
 * Represents a markdown underline element
 */
export interface MarkdownUnderline {
	from: number; // Start of opening delimiter
	to: number; // End of closing delimiter
	delimiterType: '<u>';
	openDelimiterFrom: number;
	openDelimiterTo: number;
	contentFrom: number;
	contentTo: number;
	closeDelimiterFrom: number;
	closeDelimiterTo: number;
}

/**
 * Represents a markdown italic element
 */
export interface MarkdownItalic {
	from: number; // Start of opening delimiter
	to: number; // End of closing delimiter
	delimiterType: '*' | '_';
	openDelimiterFrom: number;
	openDelimiterTo: number;
	contentFrom: number;
	contentTo: number;
	closeDelimiterFrom: number;
	closeDelimiterTo: number;
}

/**
 * Represents a markdown link element
 */
export interface MarkdownLink {
	from: number; // Start of opening bracket
	to: number; // End of closing parenthesis or reference bracket
	textFrom: number;
	textTo: number;
	urlFrom: number;
	urlTo: number;
	linkType: 'inline' | 'reference';
}

/**
 * Represents a markdown comment element
 */
export interface MarkdownComment {
	from: number; // Start of opening delimiter <!--
	to: number; // End of closing delimiter -->
	contentFrom: number; // Start of comment content
	contentTo: number; // End of comment content
}

/**
 * Represents a markdown placeholder element ({:...:} syntax)
 */
export interface MarkdownPlaceholder {
	from: number; // Start of opening delimiter {:
	to: number; // End of closing delimiter :}
	contentFrom: number; // Start of placeholder content (after {:)
	contentTo: number; // End of placeholder content (before :})
}

/**
 * Check if a line containing `---` is a metadata delimiter or a horizontal rule.
 * A horizontal rule has blank lines both above AND below it.
 * A metadata delimiter does NOT have blank lines both above and below.
 *
 * Special case: If `---` is at line 1, it's always a frontmatter delimiter.
 */
export function isMetadataDelimiter(lineNum: number, doc: Text): boolean {
	if (lineNum < 1 || lineNum > doc.lines) return false;

	const line = doc.line(lineNum);
	const lineText = line.text.trim();

	// Must start with exactly three dashes
	if (!lineText.startsWith('---')) return false;

	// If there's content after the dashes (other than whitespace), it's not a delimiter
	const afterDashes = lineText.slice(3).trim();
	if (afterDashes.length > 0) return false;

	// Special case: If at line 1, it's always frontmatter
	if (lineNum === 1) return true;

	// Check for horizontal rule (blank lines both above AND below)
	const prevLine = lineNum > 1 ? doc.line(lineNum - 1).text.trim() : '';
	const nextLine = lineNum < doc.lines ? doc.line(lineNum + 1).text.trim() : '';

	const hasBlankAbove = prevLine === '';
	const hasBlankBelow = lineNum === doc.lines || nextLine === '';

	// If blank lines both above and below, it's a horizontal rule, not metadata
	return !(hasBlankAbove && hasBlankBelow);
}

/**
 * Represents a fenced code block with line numbers (1-indexed for CodeMirror).
 */
interface FencedCodeBlockLineRange {
	startLine: number; // Opening fence line (1-indexed)
	endLine: number; // Closing fence line (1-indexed), or doc.lines if unclosed
}

/**
 * Cache for fenced code blocks using WeakMap for O(1) lookup.
 */
const fencedCodeBlocksCache = new WeakMap<Text, FencedCodeBlockLineRange[]>();

/**
 * Find all fenced code block line ranges in a CodeMirror document.
 * Uses centralized patterns from $lib/parsing.
 *
 * @param doc - CodeMirror Text object
 * @returns Array of line ranges for fenced code blocks
 */
function findFencedCodeBlockLineRanges(doc: Text): FencedCodeBlockLineRange[] {
	// Check cache first
	const cached = fencedCodeBlocksCache.get(doc);
	if (cached) return cached;

	const blocks: FencedCodeBlockLineRange[] = [];
	let i = 1;

	while (i <= doc.lines) {
		const line = doc.line(i);
		const match = line.text.match(FENCED_CODE_OPEN_PATTERN);

		if (match) {
			const fence = match[1] as '```' | '~~~';
			const startLine = i;
			const closingPattern = createClosingFencePattern(fence);

			// Find closing fence
			let endLine = doc.lines; // Default to end if unclosed
			i++;

			while (i <= doc.lines) {
				const closeLine = doc.line(i);
				if (closingPattern.test(closeLine.text)) {
					endLine = i;
					i++;
					break;
				}
				i++;
			}

			blocks.push({ startLine, endLine });
		} else {
			i++;
		}
	}

	fencedCodeBlocksCache.set(doc, blocks);
	return blocks;
}

/**
 * Check if a line is inside a fenced code block (between opening and closing fence).
 *
 * @param lineNum - 1-indexed line number
 * @param blocks - Pre-computed fenced code block ranges
 * @returns true if the line is inside a fenced code block
 */
function isLineInsideFencedCodeBlock(lineNum: number, blocks: FencedCodeBlockLineRange[]): boolean {
	return blocks.some((block) => lineNum > block.startLine && lineNum < block.endLine);
}

/**
 * Cache for metadata blocks using WeakMap for O(1) lookup.
 * Keys on the Text object reference directly, avoiding expensive toString().
 * WeakMap automatically garbage collects when Text objects are no longer referenced.
 */
const metadataBlocksCache = new WeakMap<Text, MetadataBlock[]>();

/**
 * Find all metadata blocks in the document.
 * Results are cached using WeakMap for O(1) reference-based lookup.
 *
 * Per EXTENDED_MARKDOWN.md spec:
 * "`---` inside fenced code blocks (``` or ~~~) is not processed as a delimiter"
 */
export function findMetadataBlocks(doc: Text): MetadataBlock[] {
	// Return cached result if available (O(1) reference lookup)
	const cached = metadataBlocksCache.get(doc);
	if (cached) {
		return cached;
	}

	// Pre-compute fenced code block ranges (also cached)
	const fencedBlocks = findFencedCodeBlockLineRanges(doc);

	const blocks: MetadataBlock[] = [];
	let i = 1;

	while (i <= doc.lines) {
		// Skip lines inside fenced code blocks (SPEC COMPLIANCE)
		if (isLineInsideFencedCodeBlock(i, fencedBlocks)) {
			i++;
			continue;
		}

		if (isMetadataDelimiter(i, doc)) {
			const openLine = doc.line(i);

			// Enforce that opening delimiters (except at start of file) must have a blank line before them.
			// This prevents setext headers (Text\n---) and some horizontal rules from being misidentified as metadata openers.
			// Note: isMetadataDelimiter already handles the "blank above AND blank below" (HR) case.
			if (i > 1) {
				const prevLineText = doc.line(i - 1).text.trim();
				if (prevLineText !== '') {
					// Not a valid opener (likely a setext header or HR attached to text)
					i++;
					continue;
				}
			}

			const from = openLine.from;
			const contentFrom = openLine.to + 1;

			// Find matching closing delimiter
			let closeLine: number | null = null;
			for (let j = i + 1; j <= doc.lines; j++) {
				// Skip lines inside fenced code blocks when searching for closer
				if (isLineInsideFencedCodeBlock(j, fencedBlocks)) {
					continue;
				}

				const line = doc.line(j);
				const lineText = line.text.trim();
				// For closing delimiter, we are more lenient about surrounding whitespace.
				// Any line that consists solely of '---' is considered a closer once a block is open.
				// We do NOT use isMetadataDelimiter here because it excludes '---' surrounded by blank lines (treating them as HRs),
				// which causes valid closers to be missed if the user leaves a blank line before the closer.
				if (lineText.startsWith('---') && lineText.slice(3).trim().length === 0) {
					closeLine = j;
					break;
				}
			}

			if (closeLine !== null) {
				const closeLineObj = doc.line(closeLine);
				// contentTo should be the position just before the closing --- line
				// This includes any blank lines between content and the closer
				const contentToPos = closeLineObj.from > 0 ? closeLineObj.from - 1 : closeLineObj.from;
				blocks.push({
					from,
					to: closeLineObj.to,
					contentFrom,
					contentTo: Math.max(contentFrom, contentToPos)
				});
				i = closeLine + 1;
			} else {
				// Unclosed block - extends to end of document
				blocks.push({
					from,
					to: doc.length,
					contentFrom,
					contentTo: doc.length
				});
				break;
			}
		} else {
			i++;
		}
	}

	// Cache the result
	metadataBlocksCache.set(doc, blocks);

	return blocks;
}

/**
 * Get all line positions within a metadata block's content area.
 * This includes the opening delimiter, all content lines (including blank lines),
 * and the closing delimiter.
 *
 * Use this instead of manually iterating to avoid off-by-one errors with blank lines.
 *
 * @param block - The metadata block
 * @param doc - The CodeMirror Text document
 * @returns Object with arrays of line positions for decorating
 */
export function getBlockLinePositions(
	block: MetadataBlock,
	doc: Text
): {
	openingDelimiterFrom: number;
	contentLineFroms: number[];
	closingDelimiterFrom: number | null;
} {
	const openLine = doc.lineAt(block.from);
	const contentLineFroms: number[] = [];

	// Handle empty content blocks (contentFrom >= contentTo means no content)
	// This happens when the opening and closing delimiters are on consecutive lines
	if (block.contentFrom < block.contentTo) {
		// Iterate through all content lines
		// NOTE: Use > (not >=) to include empty lines where line.from === block.contentTo
		let pos = openLine.to;
		while (pos < block.contentTo) {
			const line = doc.lineAt(pos + 1);
			if (line.from > block.contentTo) break;
			contentLineFroms.push(line.from);
			pos = line.to;
		}
	}

	// Closing delimiter exists if contentTo < to
	const closingDelimiterFrom = block.contentTo < block.to ? doc.lineAt(block.to).from : null;

	return {
		openingDelimiterFrom: openLine.from,
		contentLineFroms,
		closingDelimiterFrom
	};
}

/**
 * Find CARD and QUILL keywords within a range
 */
export function findCardQuillKeywords(from: number, to: number, doc: Text): CardQuillKeyword[] {
	const text = doc.sliceString(from, to);
	const regex = new RegExp(`^(CARD|QUILL):\\s*(${IDENTIFIER_STR})`, 'gm');
	const keywords: CardQuillKeyword[] = [];

	let match;
	while ((match = regex.exec(text)) !== null) {
		const keywordStart = from + match.index;
		const keywordEnd = keywordStart + match[1].length;
		const nameStart = from + match.index + match[0].lastIndexOf(match[2]);
		const nameEnd = nameStart + match[2].length;

		keywords.push({
			from: keywordStart,
			to: from + match.index + match[0].length,
			keyword: match[1] as 'CARD' | 'QUILL',
			keywordFrom: keywordStart,
			keywordTo: keywordEnd,
			nameFrom: nameStart,
			nameTo: nameEnd,
			name: match[2]
		});
	}

	return keywords;
}

/**
 * Find YAML key-value pairs within a range
 *
 * Note: This is a simplified YAML parser that handles common patterns only.
 * Limitations:
 * - Does not support nested structures (lists, objects)
 * - Does not support multi-line values
 * - Does not support YAML anchors or references
 * - Does not support complex data types (dates, null, etc.)
 * - Boolean detection is limited to 'true' and 'false' (lowercase only)
 */
export function findYamlPairs(from: number, to: number, doc: Text): YamlPair[] {
	const text = doc.sliceString(from, to);
	const pairs: YamlPair[] = [];

	// Simple YAML key-value pattern: key: value
	// This is a basic implementation - not a full YAML parser
	const lines = text.split('\n');
	let currentPos = from;

	// Pattern to detect YAML tags: !tagname followed by space and value
	const tagPattern = /^!([a-zA-Z_][a-zA-Z0-9_]*)\s+(.*)$/;

	for (const line of lines) {
		// Skip CARD/QUILL lines as they're handled separately
		if (line.trim().match(/^(CARD|QUILL):/)) {
			currentPos += line.length + 1; // +1 for newline
			continue;
		}

		// Match YAML key: value pattern (value is optional for multi-line structures)
		const match = line.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
		if (match) {
			const indent = match[1];
			const key = match[2];
			const rawValue = match[3];

			const keyStart = currentPos + indent.length;
			const keyEnd = keyStart + key.length;

			// Only add decoration if there's a value on the same line
			if (rawValue.trim().length > 0) {
				// Search for the value starting AFTER the colon to avoid finding the key
				// when key and value are identical (e.g., "asdf: asdf")
				const colonIndex = indent.length + key.length;
				const rawValueStartInLine = line.indexOf(rawValue, colonIndex + 1);
				const rawValueStart = currentPos + rawValueStartInLine;
				const rawValueEnd = rawValueStart + rawValue.length;

				// Check for YAML tag (e.g., !fill value)
				let tag: string | undefined;
				let tagFrom: number | undefined;
				let tagTo: number | undefined;
				let actualValue = rawValue;
				let valueStart = rawValueStart;
				let valueEnd = rawValueEnd;

				const tagMatch = rawValue.match(tagPattern);
				if (tagMatch) {
					tag = tagMatch[1];
					tagFrom = rawValueStart;
					tagTo = rawValueStart + 1 + tag.length; // !tagname

					// Adjust value to be after the tag
					actualValue = tagMatch[2];
					valueStart = tagTo + 1; // +1 for the space after tag
					valueEnd = rawValueEnd;
				}

				// Determine value type based on actual value (not including tag)
				let valueType: 'string' | 'number' | 'boolean' | 'unknown' = 'unknown';
				const trimmedValue = actualValue.trim();

				if (trimmedValue === 'true' || trimmedValue === 'false') {
					valueType = 'boolean';
				} else if (/^-?\d+(\.\d+)?$/.test(trimmedValue)) {
					valueType = 'number';
				} else if (trimmedValue.length > 0) {
					// Default to string for non-empty values
					// This handles quoted strings and unquoted text
					valueType = 'string';
				}

				const pair: YamlPair = {
					keyFrom: keyStart,
					keyTo: keyEnd,
					valueFrom: valueStart,
					valueTo: valueEnd,
					valueType
				};

				// Add tag info if present
				if (tag !== undefined) {
					pair.tag = tag;
					pair.tagFrom = tagFrom;
					pair.tagTo = tagTo;
				}

				pairs.push(pair);
			} else {
				// Key with no value (e.g., parent of a list) - just highlight the key
				pairs.push({
					keyFrom: keyStart,
					keyTo: keyEnd,
					valueFrom: keyEnd, // No value, so use keyEnd
					valueTo: keyEnd, // Zero-width value
					valueType: 'unknown'
				});
			}
		}

		currentPos += line.length + 1; // +1 for newline
	}

	return pairs;
}

/**
 * Represents a YAML array field with a tag (e.g., memo_for: !fill followed by array items)
 */
export interface YamlTaggedArray {
	keyFrom: number;
	keyTo: number;
	tag: string;
	tagFrom: number;
	tagTo: number;
	/** Line positions of array items that should be highlighted */
	itemLines: Array<{ from: number; to: number }>;
}

/**
 * Find YAML arrays with tags within a range.
 * Handles the pattern: key: !tag followed by array items (- item)
 *
 * @example
 * memo_for: !fill
 * - org1
 * - org2
 */
export function findYamlTaggedArrays(from: number, to: number, doc: Text): YamlTaggedArray[] {
	const text = doc.sliceString(from, to);
	const arrays: YamlTaggedArray[] = [];

	const lines = text.split('\n');
	let currentPos = from;

	// Pattern to detect: key: !tag (with no value after the tag)
	const keyWithTagPattern = /^(\s*)([a-zA-Z_][a-zA-Z0-9_-]*):\s*(!([a-zA-Z_][a-zA-Z0-9_]*))(\s*)$/;
	// Pattern to detect array item: - value
	const arrayItemPattern = /^(\s*)-\s+/;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const keyMatch = line.match(keyWithTagPattern);

		if (keyMatch) {
			const indent = keyMatch[1];
			const key = keyMatch[2];
			const fullTag = keyMatch[3]; // e.g., !fill
			const tagName = keyMatch[4]; // e.g., fill

			const keyStart = currentPos + indent.length;
			const keyEnd = keyStart + key.length;
			const tagStart = currentPos + line.indexOf(fullTag);
			const tagEnd = tagStart + fullTag.length;

			// Collect following array items at the same or greater indent
			const itemLines: Array<{ from: number; to: number }> = [];
			let nextPos = currentPos + line.length + 1;
			let j = i + 1;

			while (j < lines.length) {
				const nextLine = lines[j];
				const itemMatch = nextLine.match(arrayItemPattern);

				if (itemMatch) {
					// Check indent level - array items must have more indent than key
					const itemIndent = itemMatch[1].length;
					if (itemIndent > indent.length || indent.length === 0) {
						itemLines.push({
							from: nextPos,
							to: nextPos + nextLine.length
						});
					} else {
						break; // Different indent, stop collecting
					}
				} else if (nextLine.trim() === '') {
					// Empty line within array - continue
				} else {
					// Non-array line - stop collecting
					break;
				}

				nextPos += nextLine.length + 1;
				j++;
			}

			// Only add if there are array items
			if (itemLines.length > 0) {
				arrays.push({
					keyFrom: keyStart,
					keyTo: keyEnd,
					tag: tagName,
					tagFrom: tagStart,
					tagTo: tagEnd,
					itemLines
				});
			}
		}

		currentPos += line.length + 1;
	}

	return arrays;
}

/**
 * Find YAML comments within a range
 * Comments start with # and continue to the end of the line
 */
export function findYamlComments(from: number, to: number, doc: Text): YamlComment[] {
	const text = doc.sliceString(from, to);
	const comments: YamlComment[] = [];

	// Match # character followed by any content to end of line
	const regex = /#[^\n]*/g;

	let match;
	while ((match = regex.exec(text)) !== null) {
		const commentStart = from + match.index;
		const commentEnd = commentStart + match[0].length;

		comments.push({
			from: commentStart,
			to: commentEnd
		});
	}

	return comments;
}

/**
 * Find markdown bold patterns within a range, excluding metadata blocks
 * Matches **text** patterns
 */
export function findMarkdownBold(from: number, to: number, doc: Text): MarkdownBold[] {
	const text = doc.sliceString(from, to);
	const bold: MarkdownBold[] = [];

	// Get metadata blocks to exclude them
	const metadataBlocks = findMetadataBlocks(doc);

	// Helper to check if a position is inside a metadata block
	const isInMetadataBlock = (pos: number): boolean => {
		return metadataBlocks.some((block) => pos >= block.from && pos < block.to);
	};

	// Match **text** pattern (must have content, not just **)
	// Also ensure asterisks are not flanked by whitespace on the inside
	const doubleAsterisk = /\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*/g;
	let match;
	while ((match = doubleAsterisk.exec(text)) !== null) {
		const matchStart = from + match.index;
		const matchEnd = matchStart + match[0].length;

		// Skip if inside metadata block
		if (isInMetadataBlock(matchStart)) continue;

		bold.push({
			from: matchStart,
			to: matchEnd,
			delimiterType: '**',
			openDelimiterFrom: matchStart,
			openDelimiterTo: matchStart + 2,
			contentFrom: matchStart + 2,
			contentTo: matchEnd - 2,
			closeDelimiterFrom: matchEnd - 2,
			closeDelimiterTo: matchEnd
		});
	}

	return bold;
}

/**
 * Find markdown underline patterns within a range, excluding metadata blocks
 * Matches <u>text</u> patterns
 */
export function findMarkdownUnderline(from: number, to: number, doc: Text): MarkdownUnderline[] {
	const text = doc.sliceString(from, to);
	const underline: MarkdownUnderline[] = [];

	// Get metadata blocks to exclude them
	const metadataBlocks = findMetadataBlocks(doc);

	// Helper to check if a position is inside a metadata block
	const isInMetadataBlock = (pos: number): boolean => {
		return metadataBlocks.some((block) => pos >= block.from && pos < block.to);
	};

	// Match <u>text</u> pattern (must have content, no newlines)
	const uTag = /<u>([^<\n]+?)<\/u>/g;
	let match;
	while ((match = uTag.exec(text)) !== null) {
		const matchStart = from + match.index;
		const matchEnd = matchStart + match[0].length;

		// Skip if inside metadata block
		if (isInMetadataBlock(matchStart)) continue;

		// <u> is 3 chars, </u> is 4 chars
		underline.push({
			from: matchStart,
			to: matchEnd,
			delimiterType: '<u>',
			openDelimiterFrom: matchStart,
			openDelimiterTo: matchStart + 3,
			contentFrom: matchStart + 3,
			contentTo: matchEnd - 4,
			closeDelimiterFrom: matchEnd - 4,
			closeDelimiterTo: matchEnd
		});
	}

	return underline;
}

/**
 * Find markdown italic patterns within a range, excluding metadata blocks
 * Matches both *text* and _text_ patterns
 * Note: Must distinguish from bold patterns (**text**)
 */
export function findMarkdownItalic(from: number, to: number, doc: Text): MarkdownItalic[] {
	const text = doc.sliceString(from, to);
	const italic: MarkdownItalic[] = [];

	// Get metadata blocks to exclude them
	const metadataBlocks = findMetadataBlocks(doc);

	// Helper to check if a position is inside a metadata block
	const isInMetadataBlock = (pos: number): boolean => {
		return metadataBlocks.some((block) => pos >= block.from && pos < block.to);
	};

	// Match *text* pattern (single asterisk, not double)
	// Use negative lookbehind/lookahead to avoid matching ** patterns
	// Also ensure asterisks are not flanked by whitespace on the inside
	const singleAsterisk = /(?<!\*)\*(?!\*)(?!\s)([^*\n]+?)(?<!\s)\*(?!\*)/g;
	let match;
	while ((match = singleAsterisk.exec(text)) !== null) {
		const matchStart = from + match.index;
		const matchEnd = matchStart + match[0].length;

		// Skip if inside metadata block
		if (isInMetadataBlock(matchStart)) continue;

		italic.push({
			from: matchStart,
			to: matchEnd,
			delimiterType: '*',
			openDelimiterFrom: matchStart,
			openDelimiterTo: matchStart + 1,
			contentFrom: matchStart + 1,
			contentTo: matchEnd - 1,
			closeDelimiterFrom: matchEnd - 1,
			closeDelimiterTo: matchEnd
		});
	}

	// Match _text_ pattern (single underscore, not double)
	// Use negative lookbehind/lookahead to avoid matching __ patterns
	// Also ensure underscores are not flanked by whitespace on the inside
	const singleUnderscore = /(?<!_)_(?!_)(?!\s)([^_\n]+?)(?<!\s)_(?!_)/g;
	while ((match = singleUnderscore.exec(text)) !== null) {
		const matchStart = from + match.index;
		const matchEnd = matchStart + match[0].length;

		// Skip if inside metadata block
		if (isInMetadataBlock(matchStart)) continue;

		italic.push({
			from: matchStart,
			to: matchEnd,
			delimiterType: '_',
			openDelimiterFrom: matchStart,
			openDelimiterTo: matchStart + 1,
			contentFrom: matchStart + 1,
			contentTo: matchEnd - 1,
			closeDelimiterFrom: matchEnd - 1,
			closeDelimiterTo: matchEnd
		});
	}

	return italic;
}

/**
 * Find markdown link patterns within a range, excluding metadata blocks
 * Matches both [text](url) and [text][ref] patterns
 */
export function findMarkdownLinks(from: number, to: number, doc: Text): MarkdownLink[] {
	const text = doc.sliceString(from, to);
	const links: MarkdownLink[] = [];

	// Get metadata blocks to exclude them
	const metadataBlocks = findMetadataBlocks(doc);

	// Helper to check if a position is inside a metadata block
	const isInMetadataBlock = (pos: number): boolean => {
		return metadataBlocks.some((block) => pos >= block.from && pos < block.to);
	};

	// Match [text](url) pattern (inline links)
	const inlineLink = /\[([^\]]+)\]\(([^)]+)\)/g;
	let match;
	while ((match = inlineLink.exec(text)) !== null) {
		const matchStart = from + match.index;
		const matchEnd = matchStart + match[0].length;

		// Skip if inside metadata block
		if (isInMetadataBlock(matchStart)) continue;

		const textStart = matchStart + 1; // After [
		const textEnd = textStart + match[1].length;
		const urlStart = textEnd + 2; // After ](
		const urlEnd = urlStart + match[2].length;

		links.push({
			from: matchStart,
			to: matchEnd,
			textFrom: textStart,
			textTo: textEnd,
			urlFrom: urlStart,
			urlTo: urlEnd,
			linkType: 'inline'
		});
	}

	// Match [text][ref] pattern (reference links)
	const referenceLink = /\[([^\]]+)\]\[([^\]]+)\]/g;
	while ((match = referenceLink.exec(text)) !== null) {
		const matchStart = from + match.index;
		const matchEnd = matchStart + match[0].length;

		// Skip if inside metadata block
		if (isInMetadataBlock(matchStart)) continue;

		const textStart = matchStart + 1; // After [
		const textEnd = textStart + match[1].length;
		const refStart = textEnd + 2; // After ][
		const refEnd = refStart + match[2].length;

		links.push({
			from: matchStart,
			to: matchEnd,
			textFrom: textStart,
			textTo: textEnd,
			urlFrom: refStart,
			urlTo: refEnd,
			linkType: 'reference'
		});
	}

	return links;
}

/**
 * Find markdown comment patterns within a range, excluding metadata blocks
 * Matches HTML-style comments: <!-- comment --> or <!--- comment -->
 */
export function findMarkdownComments(from: number, to: number, doc: Text): MarkdownComment[] {
	const text = doc.sliceString(from, to);
	const comments: MarkdownComment[] = [];

	// Get metadata blocks to exclude them
	const metadataBlocks = findMetadataBlocks(doc);

	// Helper to check if a position is inside a metadata block
	const isInMetadataBlock = (pos: number): boolean => {
		return metadataBlocks.some((block) => pos >= block.from && pos < block.to);
	};

	// Match <!-- ... --> pattern (supports multiple dashes like <!--- ... --->)
	// The regex matches:
	// - <!--+ (one or more dashes after <!)
	// - any content (non-greedy, including newlines via [\s\S])
	// - ---> (one or more dashes before >)
	const commentPattern = /<!--(-*)([\s\S]*?)(-*)-->/g;
	let match;
	while ((match = commentPattern.exec(text)) !== null) {
		const matchStart = from + match.index;
		const matchEnd = matchStart + match[0].length;

		// Skip if inside metadata block
		if (isInMetadataBlock(matchStart)) continue;

		// Calculate positions for opening delimiter, content, and closing delimiter
		// Opening delimiter: <!-- plus any extra dashes
		const openingDelimiterLength = 4 + match[1].length; // <!-- plus extra dashes
		const closingDelimiterLength = 3 + match[3].length; // --> plus extra dashes

		const contentStart = matchStart + openingDelimiterLength;
		const contentEnd = matchEnd - closingDelimiterLength;

		comments.push({
			from: matchStart,
			to: matchEnd,
			contentFrom: contentStart,
			contentTo: contentEnd
		});
	}

	return comments;
}

/**
 * Find ranges of inline code spans within a range
 * Used for exclusion in other pattern detection functions
 */
function findInlineCodeRanges(from: number, to: number, doc: Text): Range[] {
	const text = doc.sliceString(from, to);
	const ranges: Range[] = [];

	// Match backtick code spans (single or multiple backticks)
	// Single backticks: `code`
	// Double+ backticks: ``code`` (allows ` inside)
	// Pattern handles single-character code spans like `x` and multi-character spans
	// Also handles empty code spans like `` which are valid markdown
	const codePattern = /(`+)([\s\S]*?)\1/g;
	let match;
	while ((match = codePattern.exec(text)) !== null) {
		// Include all matched code spans (including empty ones like ``)
		ranges.push({
			from: from + match.index,
			to: from + match.index + match[0].length
		});
	}

	return ranges;
}

/**
 * Find ranges of fenced code blocks within a range
 * Used for exclusion in other pattern detection functions
 */
function findFencedCodeBlockRanges(from: number, to: number, doc: Text): Range[] {
	const text = doc.sliceString(from, to);
	const ranges: Range[] = [];

	// Match fenced code blocks (``` or ~~~)
	const fencePattern = /^(```|~~~).*\n[\s\S]*?^\1\s*$/gm;
	let match;
	while ((match = fencePattern.exec(text)) !== null) {
		ranges.push({
			from: from + match.index,
			to: from + match.index + match[0].length
		});
	}

	return ranges;
}

/**
 * Find markdown placeholder patterns within a range
 * Matches {:...:} patterns, excluding those in metadata blocks, code blocks,
 * inline code, and link URLs
 */
export function findMarkdownPlaceholders(
	from: number,
	to: number,
	doc: Text
): MarkdownPlaceholder[] {
	const text = doc.sliceString(from, to);
	const placeholders: MarkdownPlaceholder[] = [];

	// Get exclusion zones
	const metadataBlocks = findMetadataBlocks(doc);
	const inlineCodeRanges = findInlineCodeRanges(from, to, doc);
	const fencedCodeRanges = findFencedCodeBlockRanges(from, to, doc);
	const links = findMarkdownLinks(from, to, doc);

	// Helper to check if a position is inside a metadata block
	const isInMetadataBlock = (pos: number): boolean => {
		return metadataBlocks.some((block) => pos >= block.from && pos < block.to);
	};

	// Helper to check if a position is inside inline code
	const isInInlineCode = (pos: number): boolean => {
		return inlineCodeRanges.some((range) => pos >= range.from && pos < range.to);
	};

	// Helper to check if a position is inside a fenced code block
	const isInFencedCodeBlock = (pos: number): boolean => {
		return fencedCodeRanges.some((range) => pos >= range.from && pos < range.to);
	};

	// Helper to check if a position is inside a link URL (parentheses part)
	const isInLinkUrl = (pos: number): boolean => {
		return links.some(
			(link) => link.linkType === 'inline' && pos >= link.urlFrom && pos < link.urlTo
		);
	};

	// Match {:...:} or {:...: } pattern (non-greedy, same line only)
	// Pattern breakdown:
	// - {: : literal opening delimiter
	// - ((?:[^:\n]|:(?!\s*\}))*)  : capture group for content:
	//   - [^:\n] : any char except : or newline
	//   - :(?!\s*}) : single : not followed by optional whitespace and } (allows "a : b" inside placeholder)
	// - :\s*} : literal closing delimiter with optional whitespace before }
	const placeholderPattern = /\{:((?:[^:\n]|:(?!\s*\}))*):\s*\}/g;
	let match;
	while ((match = placeholderPattern.exec(text)) !== null) {
		const matchStart = from + match.index;
		const matchEnd = matchStart + match[0].length;

		// Skip if inside any exclusion zone
		if (isInMetadataBlock(matchStart)) continue;
		if (isInInlineCode(matchStart)) continue;
		if (isInFencedCodeBlock(matchStart)) continue;
		if (isInLinkUrl(matchStart)) continue;

		// Extract content and trim whitespace
		const content = match[1];
		const trimmedContent = content.trim();
		const contentStartOffset = content.length > 0 ? content.indexOf(trimmedContent) : 0;
		const contentFrom = matchStart + 2 + contentStartOffset; // After {: plus any leading whitespace
		const contentTo = contentFrom + trimmedContent.length;

		placeholders.push({
			from: matchStart,
			to: matchEnd,
			contentFrom,
			contentTo
		});
	}

	return placeholders;
}
