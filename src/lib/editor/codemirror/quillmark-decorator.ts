import {
	ViewPlugin,
	Decoration,
	type DecorationSet,
	type EditorView,
	type ViewUpdate,
	WidgetType
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { foldedRanges, foldEffect, unfoldEffect } from '@codemirror/language';
import {
	findMetadataBlocks,
	findCardQuillKeywords,
	findYamlPairs,
	findYamlComments,
	findYamlTaggedArrays,
	findMarkdownBold,
	findMarkdownUnderline,
	findMarkdownItalic,
	findMarkdownLinks,
	findMarkdownComments,
	findMarkdownPlaceholders,
	getBlockLinePositions,
	type MetadataBlock
} from './quillmark-patterns';
import { foldMetadataBlockAtPosition } from './quillmark-fold-utils';

/**
 * Widget for clickable opening delimiter that triggers folding
 */
class FoldableDelimiterWidget extends WidgetType {
	constructor(private lineNumber: number) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const span = document.createElement('span');
		span.className = 'cm-quillmark-delimiter';
		span.textContent = '---';
		span.style.cursor = 'pointer';
		span.onclick = (e) => {
			e.preventDefault();
			const pos = view.posAtDOM(span);
			foldMetadataBlockAtPosition(view, pos);
		};
		return span;
	}
}

/**
 * Widget for clickable closing delimiter that triggers folding
 */
class ClosingDelimiterWidget extends WidgetType {
	constructor(private lineNumber: number) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const span = document.createElement('span');
		span.className = 'cm-quillmark-delimiter';
		span.textContent = '---';
		span.style.cursor = 'pointer';
		span.onclick = (e) => {
			e.preventDefault();
			const pos = view.posAtDOM(span);
			foldMetadataBlockAtPosition(view, pos);
		};
		return span;
	}
}

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
const yamlTagFillMark = Decoration.mark({ class: 'cm-quillmark-yaml-tag-fill' });
const yamlFillValueMark = Decoration.mark({ class: 'cm-quillmark-yaml-fill-value' });

/**
 * Decoration marks for Markdown syntax elements
 */
const markdownBoldDelimiterMark = Decoration.mark({ class: 'cm-markdown-bold-delimiter' });
const markdownBoldContentMark = Decoration.mark({ class: 'cm-markdown-bold-content' });
const markdownUnderlineDelimiterMark = Decoration.mark({
	class: 'cm-markdown-underline-delimiter'
});
const markdownUnderlineContentMark = Decoration.mark({ class: 'cm-markdown-underline-content' });
const markdownItalicDelimiterMark = Decoration.mark({ class: 'cm-markdown-italic-delimiter' });
const markdownItalicContentMark = Decoration.mark({ class: 'cm-markdown-italic-content' });
const markdownLinkTextMark = Decoration.mark({ class: 'cm-markdown-link-text' });
const markdownLinkUrlMark = Decoration.mark({ class: 'cm-markdown-link-url' });
const markdownLinkBracketMark = Decoration.mark({ class: 'cm-markdown-link-bracket' });
const markdownCommentDelimiterMark = Decoration.mark({ class: 'cm-markdown-comment-delimiter' });
const markdownCommentContentMark = Decoration.mark({ class: 'cm-markdown-comment-content' });
const markdownPlaceholderMark = Decoration.mark({ class: 'cm-markdown-placeholder' });
const markdownPlaceholderDelimiterMark = Decoration.mark({
	class: 'cm-markdown-placeholder-delimiter'
});
const markdownPlaceholderContentMark = Decoration.mark({
	class: 'cm-markdown-placeholder-content'
});

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
		// Check if any fold/unfold effects were applied
		let hasFoldChange = false;
		for (const transaction of update.transactions) {
			for (const effect of transaction.effects) {
				if (effect.is(foldEffect) || effect.is(unfoldEffect)) {
					hasFoldChange = true;
					break;
				}
			}
			if (hasFoldChange) break;
		}

		// Recompute on doc/fold changes AND viewport changes (to ensure decorations are created when editor mounts and becomes visible)
		if (update.docChanged || hasFoldChange || update.viewportChanged) {
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

				this.collectBlockDecorations(allDecorations, block, doc, view);
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
		doc: import('@codemirror/state').Text,
		view: EditorView
	) {
		// Collect all decorations for this block
		// We need to track the type to ensure line decorations come before mark decorations

		// Check if this block is currently folded
		const folded = foldedRanges(view.state);
		let isFolded = false;
		folded.between(block.from, block.to, (from) => {
			if (from === block.from) {
				isFolded = true;
				return false;
			}
		});

		// Decorate opening delimiter line
		const openLine = doc.lineAt(block.from);

		// Only apply block styling (background) if not folded
		if (!isFolded) {
			decorations.push({
				from: openLine.from,
				to: openLine.from,
				decoration: blockMark,
				isLine: true
			});
		}

		// Only replace the opening delimiter with a clickable widget if not folded
		if (!isFolded) {
			decorations.push({
				from: openLine.from,
				to: openLine.to,
				decoration: Decoration.replace({
					widget: new FoldableDelimiterWidget(openLine.number)
				}),
				isLine: false
			});
		}

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
			decorations.push({
				from: closeLine.from,
				to: closeLine.to,
				decoration: Decoration.replace({
					widget: new ClosingDelimiterWidget(closeLine.number)
				}),
				isLine: false
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

			// Decorate YAML tags (e.g., !fill) if present
			if (pair.tag === 'fill' && pair.tagFrom !== undefined && pair.tagTo !== undefined) {
				// Tag decoration (red)
				decorations.push({
					from: pair.tagFrom,
					to: pair.tagTo,
					decoration: yamlTagFillMark,
					isLine: false
				});

				// Value decoration (placeholder-style background)
				if (pair.valueFrom < pair.valueTo) {
					decorations.push({
						from: pair.valueFrom,
						to: pair.valueTo,
						decoration: yamlFillValueMark,
						isLine: false
					});
				}
			}
		}

		// Decorate YAML tagged arrays (e.g., memo_for: !fill followed by array items)
		const taggedArrays = findYamlTaggedArrays(block.contentFrom, block.contentTo, doc);
		for (const arr of taggedArrays) {
			// Tag decoration (red)
			if (arr.tag === 'fill') {
				decorations.push({
					from: arr.tagFrom,
					to: arr.tagTo,
					decoration: yamlTagFillMark,
					isLine: false
				});

				// Decorate each array item line
				for (const itemLine of arr.itemLines) {
					decorations.push({
						from: itemLine.from,
						to: itemLine.to,
						decoration: yamlFillValueMark,
						isLine: false
					});
				}
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
		// Find and decorate bold patterns
		const boldPatterns = findMarkdownBold(from, to, doc);
		for (const bold of boldPatterns) {
			// Opening delimiter
			decorations.push({
				from: bold.openDelimiterFrom,
				to: bold.openDelimiterTo,
				decoration: markdownBoldDelimiterMark,
				isLine: false
			});

			// Content
			decorations.push({
				from: bold.contentFrom,
				to: bold.contentTo,
				decoration: markdownBoldContentMark,
				isLine: false
			});

			// Closing delimiter
			decorations.push({
				from: bold.closeDelimiterFrom,
				to: bold.closeDelimiterTo,
				decoration: markdownBoldDelimiterMark,
				isLine: false
			});
		}

		// Find and decorate underline patterns
		const underlinePatterns = findMarkdownUnderline(from, to, doc);
		for (const underline of underlinePatterns) {
			// Opening delimiter
			decorations.push({
				from: underline.openDelimiterFrom,
				to: underline.openDelimiterTo,
				decoration: markdownUnderlineDelimiterMark,
				isLine: false
			});

			// Content
			decorations.push({
				from: underline.contentFrom,
				to: underline.contentTo,
				decoration: markdownUnderlineContentMark,
				isLine: false
			});

			// Closing delimiter
			decorations.push({
				from: underline.closeDelimiterFrom,
				to: underline.closeDelimiterTo,
				decoration: markdownUnderlineDelimiterMark,
				isLine: false
			});
		}

		// Find and decorate italic patterns
		const italicPatterns = findMarkdownItalic(from, to, doc);
		for (const italic of italicPatterns) {
			// Opening delimiter
			decorations.push({
				from: italic.openDelimiterFrom,
				to: italic.openDelimiterTo,
				decoration: markdownItalicDelimiterMark,
				isLine: false
			});

			// Content
			decorations.push({
				from: italic.contentFrom,
				to: italic.contentTo,
				decoration: markdownItalicContentMark,
				isLine: false
			});

			// Closing delimiter
			decorations.push({
				from: italic.closeDelimiterFrom,
				to: italic.closeDelimiterTo,
				decoration: markdownItalicDelimiterMark,
				isLine: false
			});
		}

		// Find and decorate link patterns
		const linkPatterns = findMarkdownLinks(from, to, doc);
		for (const link of linkPatterns) {
			// Opening bracket
			decorations.push({
				from: link.from,
				to: link.from + 1,
				decoration: markdownLinkBracketMark,
				isLine: false
			});

			// Link text
			decorations.push({
				from: link.textFrom,
				to: link.textTo,
				decoration: markdownLinkTextMark,
				isLine: false
			});

			// Closing bracket
			decorations.push({
				from: link.textTo,
				to: link.textTo + 1,
				decoration: markdownLinkBracketMark,
				isLine: false
			});

			if (link.linkType === 'inline') {
				// Opening parenthesis
				decorations.push({
					from: link.textTo + 1,
					to: link.textTo + 2,
					decoration: markdownLinkBracketMark,
					isLine: false
				});

				// URL
				decorations.push({
					from: link.urlFrom,
					to: link.urlTo,
					decoration: markdownLinkUrlMark,
					isLine: false
				});

				// Closing parenthesis
				decorations.push({
					from: link.to - 1,
					to: link.to,
					decoration: markdownLinkBracketMark,
					isLine: false
				});
			} else {
				// Reference link: [text][ref]
				// Opening bracket for reference
				decorations.push({
					from: link.textTo + 1,
					to: link.textTo + 2,
					decoration: markdownLinkBracketMark,
					isLine: false
				});

				// Reference
				decorations.push({
					from: link.urlFrom,
					to: link.urlTo,
					decoration: markdownLinkUrlMark,
					isLine: false
				});

				// Closing bracket for reference
				decorations.push({
					from: link.to - 1,
					to: link.to,
					decoration: markdownLinkBracketMark,
					isLine: false
				});
			}
		}

		// Find and decorate comment patterns
		const commentPatterns = findMarkdownComments(from, to, doc);
		for (const comment of commentPatterns) {
			// Opening delimiter (<!-- or <!---)
			decorations.push({
				from: comment.from,
				to: comment.contentFrom,
				decoration: markdownCommentDelimiterMark,
				isLine: false
			});

			// Content (if any)
			if (comment.contentFrom < comment.contentTo) {
				decorations.push({
					from: comment.contentFrom,
					to: comment.contentTo,
					decoration: markdownCommentContentMark,
					isLine: false
				});
			}

			// Closing delimiter (-->)
			decorations.push({
				from: comment.contentTo,
				to: comment.to,
				decoration: markdownCommentDelimiterMark,
				isLine: false
			});
		}

		// Find and decorate placeholder patterns in markdown (outside metadata blocks)
		const placeholderPatterns = findMarkdownPlaceholders(from, to, doc);
		for (const placeholder of placeholderPatterns) {
			// Wrapper for entire placeholder (for click targeting and cursor style)
			decorations.push({
				from: placeholder.from,
				to: placeholder.to,
				decoration: markdownPlaceholderMark,
				isLine: false
			});

			// Opening delimiter ({:)
			decorations.push({
				from: placeholder.from,
				to: placeholder.from + 2,
				decoration: markdownPlaceholderDelimiterMark,
				isLine: false
			});

			// Content (if any)
			if (placeholder.contentFrom < placeholder.contentTo) {
				decorations.push({
					from: placeholder.contentFrom,
					to: placeholder.contentTo,
					decoration: markdownPlaceholderContentMark,
					isLine: false
				});
			}

			// Closing delimiter (:})
			decorations.push({
				from: placeholder.to - 2,
				to: placeholder.to,
				decoration: markdownPlaceholderDelimiterMark,
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
