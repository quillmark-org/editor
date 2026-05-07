/**
 * ProseMirror input rules for markdown-style shortcuts.
 * Auto-converts markdown syntax to formatting as you type.
 */

import { inputRules, textblockTypeInputRule, InputRule } from 'prosemirror-inputrules';
import type { MarkType, NodeType } from 'prosemirror-model';
import { canJoin, findWrapping } from 'prosemirror-transform';
import { quillmarkSchema } from './schema';

/**
 * Check if the resolved position is inside a list_item at any depth
 */
function isInsideListItem(state: import('prosemirror-state').EditorState, pos: number): boolean {
	const $pos = state.doc.resolve(pos);
	for (let d = $pos.depth; d >= 0; d--) {
		if ($pos.node(d).type.name === 'list_item') {
			return true;
		}
	}
	return false;
}

/**
 * Create a wrapping input rule that only triggers if NOT inside a list item.
 * This prevents `- ` from creating nested lists when already in a list.
 *
 * Based on prosemirror-inputrules wrappingInputRule implementation.
 */
function wrappingInputRuleIfNotInList(
	pattern: RegExp,
	nodeType: NodeType,
	getAttrs?: (match: RegExpMatchArray) => Record<string, unknown> | null,
	joinPredicate?: (match: RegExpMatchArray, node: import('prosemirror-model').Node) => boolean
): InputRule {
	return new InputRule(pattern, (state, match, start, end) => {
		// If inside a list item, don't transform - let the text be typed literally
		if (isInsideListItem(state, start)) {
			return null;
		}

		// Standard wrapping logic (from prosemirror-inputrules)
		const attrs = getAttrs ? getAttrs(match) : null;
		const tr = state.tr.delete(start, end);
		const $start = tr.doc.resolve(start);
		const range = $start.blockRange();
		if (!range) return null;

		const wrapping = findWrapping(range, nodeType, attrs);
		if (!wrapping) return null;

		tr.wrap(range, wrapping);
		const before = tr.doc.resolve(start - 1).nodeBefore;

		if (
			before &&
			before.type === nodeType &&
			canJoin(tr.doc, start - 1) &&
			(!joinPredicate || joinPredicate(match, before))
		) {
			tr.join(start - 1);
		}

		return tr;
	});
}

/**
 * Create an input rule that applies a mark when the pattern matches
 */
function markInputRule(pattern: RegExp, markType: MarkType): InputRule {
	return new InputRule(pattern, (state, match, start, end) => {
		const attrs = null;
		const tr = state.tr;
		const textContent = match[1];

		if (textContent) {
			// Delete the full matched text
			tr.delete(start, end);

			// Insert just the text content with the mark
			if (textContent.length > 0) {
				tr.insertText(textContent, start);
				tr.addMark(start, start + textContent.length, markType.create(attrs));
			}

			return tr;
		}

		return null;
	});
}

/**
 * Build the input rules plugin for QuillMark
 */
export function createQuillmarkInputRules() {
	const { nodes, marks } = quillmarkSchema;

	const rules: InputRule[] = [
		// Heading shortcuts: # Heading
		textblockTypeInputRule(/^(#{1,6})\s$/, nodes.heading, (match) => ({
			level: match[1].length
		})),

		// Bullet list: -, *, or + (CommonMark markers)
		// Uses context-aware rule to prevent nested list creation when already in a list
		wrappingInputRuleIfNotInList(/^\s*([-*+])\s$/, nodes.bullet_list),

		// Ordered list: 1. 2. etc
		// Uses context-aware rule to prevent nested list creation when already in a list
		wrappingInputRuleIfNotInList(
			/^(\d+)\.\s$/,
			nodes.ordered_list,
			(match) => ({ order: +match[1] }),
			(match, node) => node.childCount + node.attrs.order === +match[1]
		),

		// Code block: ```
		textblockTypeInputRule(/^```$/, nodes.code_block),

		// Bold: **text**
		markInputRule(/\*\*([^*]+)\*\*$/, marks.strong),

		// Italic: *text*
		markInputRule(/(?<!\*)\*([^*]+)\*(?!\*)$/, marks.em),

		// Underline: <u>text</u>
		markInputRule(/<u>([^<]+)<\/u>$/, marks.underline),

		// Strikethrough: ~~text~~
		markInputRule(/~~([^~]+)~~$/, marks.strikethrough),

		// Code: `text`
		markInputRule(/`([^`]+)`$/, marks.code)
	];

	return inputRules({ rules });
}
