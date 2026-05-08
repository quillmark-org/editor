import {
	ViewPlugin,
	Decoration,
	type DecorationSet,
	type EditorView,
	type ViewUpdate
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import {
	findMetadataBlocks,
	findCardQuillKeywords,
	findYamlPairs,
	findYamlComments,
	findMarkdownComments,
	getBlockLinePositions,
	type MetadataBlock
} from './quillmark-patterns';

/**
 * Decoration marks for QuillMark syntax elements
 */
const blockMark = Decoration.line({ class: 'cm-quillmark-block' });
const cardKeywordMark = Decoration.mark({ class: 'cm-quillmark-card-keyword' });
const quillKeywordMark = Decoration.mark({ class: 'cm-quillmark-quill-keyword' });
const cardNameMark = Decoration.mark({ class: 'cm-quillmark-card-name' });
const yamlKeyMark = Decoration.mark({ class: 'cm-quillmark-yaml-key' });
const yamlStringMark = Decoration.mark({ class: 'cm-quillmark-yaml-string' });
const yamlNumberMark = Decoration.mark({ class: 'cm-quillmark-yaml-number' });
const yamlBooleanMark = Decoration.mark({ class: 'cm-quillmark-yaml-bool' });
const yamlCommentMark = Decoration.mark({ class: 'cm-quillmark-yaml-comment' });

/**
 * Decoration marks for Markdown syntax elements
 */
const markdownCommentDelimiterMark = Decoration.mark({ class: 'cm-markdown-comment-delimiter' });
const markdownCommentContentMark = Decoration.mark({ class: 'cm-markdown-comment-content' });

/**
 * QuillMark decorator plugin
 * Provides syntax highlighting for QuillMark metadata blocks
 */
class QuillMarkDecorator {
	decorations: DecorationSet;

	constructor(view: EditorView) {
		this.decorations = this.computeDecorations(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			this.decorations = this.computeDecorations(update.view);
		}
	}

	computeDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		const doc = view.state.doc;

		// Find all metadata blocks
		const blocks = findMetadataBlocks(doc);

		// Collect all decorations from all visible blocks first
		const allDecorations: Array<{
			from: number;
			to: number;
			decoration: Decoration;
			isLine: boolean;
		}> = [];

		// Only process visible blocks for performance
		// Note: For documents with many blocks, this could be optimized with
		// binary search or spatial indexing to find intersecting blocks more efficiently
		for (const { from, to } of view.visibleRanges) {
			// Optimize: Binary search for the first relevant block
			// We want the first block where block.to >= from
			let startIdx = 0;
			let endIdx = blocks.length;
			while (startIdx < endIdx) {
				const mid = Math.floor((startIdx + endIdx) / 2);
				if (blocks[mid].to < from) {
					startIdx = mid + 1;
				} else {
					endIdx = mid;
				}
			}

			// Iterate from the found start index
			for (let i = startIdx; i < blocks.length; i++) {
				const block = blocks[i];

				// Stop if we've passed the visible range
				if (block.from > to) break;

				this.collectBlockDecorations(allDecorations, block, doc);
			}

			// Collect markdown decorations for visible ranges
			// These are applied to content outside metadata blocks
			this.collectMarkdownDecorations(allDecorations, from, to, doc);
		}

		// Sort all decorations by position before adding to builder
		allDecorations.sort((a, b) => {
			if (a.from !== b.from) return a.from - b.from;
			if (a.to !== b.to) return a.to - b.to;
			// Line decorations (isLine=true) should come before mark decorations (isLine=false)
			if (a.isLine !== b.isLine) return a.isLine ? -1 : 1;
			return 0;
		});

		// Add all decorations in sorted order
		for (const { from, to, decoration } of allDecorations) {
			builder.add(from, to, decoration);
		}

		return builder.finish();
	}

	collectBlockDecorations(
		decorations: Array<{
			from: number;
			to: number;
			decoration: Decoration;
			isLine: boolean;
		}>,
		block: MetadataBlock,
		doc: import('@codemirror/state').Text
	) {
		// Decorate opening delimiter line with the block background
		const openLine = doc.lineAt(block.from);
		decorations.push({
			from: openLine.from,
			to: openLine.from,
			decoration: blockMark,
			isLine: true
		});

		// Use centralized helper to get all content line positions
		// This avoids off-by-one errors with blank lines before closing delimiter
		const linePositions = getBlockLinePositions(block, doc);

		// Decorate all content lines in the block
		for (const lineFrom of linePositions.contentLineFroms) {
			decorations.push({ from: lineFrom, to: lineFrom, decoration: blockMark, isLine: true });
		}

		// Decorate closing delimiter line if it exists
		if (linePositions.closingDelimiterFrom !== null) {
			const closeLine = doc.lineAt(linePositions.closingDelimiterFrom);
			decorations.push({
				from: closeLine.from,
				to: closeLine.from,
				decoration: blockMark,
				isLine: true
			});
		}

		// Decorate CARD/QUILL keywords within the block
		const keywords = findCardQuillKeywords(block.contentFrom, block.contentTo, doc);
		for (const keyword of keywords) {
			const keywordMark = keyword.keyword === 'CARD' ? cardKeywordMark : quillKeywordMark;
			decorations.push({
				from: keyword.keywordFrom,
				to: keyword.keywordTo,
				decoration: keywordMark,
				isLine: false
			});
			decorations.push({
				from: keyword.nameFrom,
				to: keyword.nameTo,
				decoration: cardNameMark,
				isLine: false
			});
		}

		// Decorate YAML key-value pairs
		const yamlPairs = findYamlPairs(block.contentFrom, block.contentTo, doc);
		for (const pair of yamlPairs) {
			decorations.push({
				from: pair.keyFrom,
				to: pair.keyTo,
				decoration: yamlKeyMark,
				isLine: false
			});

			// Only add value decoration if there's actually a value (not zero-width)
			if (pair.valueFrom < pair.valueTo) {
				const valueMark =
					pair.valueType === 'string'
						? yamlStringMark
						: pair.valueType === 'number'
							? yamlNumberMark
							: pair.valueType === 'boolean'
								? yamlBooleanMark
								: yamlStringMark; // Default to string for unknown types

				decorations.push({
					from: pair.valueFrom,
					to: pair.valueTo,
					decoration: valueMark,
					isLine: false
				});
			}
		}

		// Decorate YAML comments
		const yamlComments = findYamlComments(block.contentFrom, block.contentTo, doc);
		for (const comment of yamlComments) {
			decorations.push({
				from: comment.from,
				to: comment.to,
				decoration: yamlCommentMark,
				isLine: false
			});
		}
	}

	collectMarkdownDecorations(
		decorations: Array<{
			from: number;
			to: number;
			decoration: Decoration;
			isLine: boolean;
		}>,
		from: number,
		to: number,
		doc: import('@codemirror/state').Text
	) {
		// Decorate HTML-style markdown comments outside metadata blocks
		const commentPatterns = findMarkdownComments(from, to, doc);
		for (const comment of commentPatterns) {
			decorations.push({
				from: comment.from,
				to: comment.contentFrom,
				decoration: markdownCommentDelimiterMark,
				isLine: false
			});

			if (comment.contentFrom < comment.contentTo) {
				decorations.push({
					from: comment.contentFrom,
					to: comment.contentTo,
					decoration: markdownCommentContentMark,
					isLine: false
				});
			}

			decorations.push({
				from: comment.contentTo,
				to: comment.to,
				decoration: markdownCommentDelimiterMark,
				isLine: false
			});
		}
	}
}

/**
 * QuillMark decorator view plugin
 */
export const quillmarkDecorator = ViewPlugin.fromClass(QuillMarkDecorator, {
	decorations: (v) => v.decorations
});
