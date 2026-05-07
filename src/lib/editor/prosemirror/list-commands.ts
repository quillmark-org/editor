/**
 * Obsidian-style list commands.
 *
 * Design principles:
 * 1. Use ProseMirror's high-level primitives (join, lift, etc.)
 * 2. Avoid complex position math - let PM handle it
 * 3. Each command does ONE thing well
 * 4. Cleanup runs after operations to fix structure
 */

import { type Command, type Transaction, TextSelection } from 'prosemirror-state';
import { liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list';
import { type Node, type NodeType } from 'prosemirror-model';
import { canJoin } from 'prosemirror-transform';
import { quillmarkSchema } from './schema';

const { list_item, bullet_list, ordered_list, paragraph } = quillmarkSchema.nodes;

function isListNode(node: Node): boolean {
	return node.type === bullet_list || node.type === ordered_list;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Find the innermost list_item containing the selection.
 */
function findListItem(
	state: import('prosemirror-state').EditorState
): { depth: number; node: Node; start: number; end: number } | null {
	const { $from } = state.selection;
	for (let d = $from.depth; d >= 0; d--) {
		const node = $from.node(d);
		if (node.type === list_item) {
			return {
				depth: d,
				node,
				start: $from.before(d),
				end: $from.after(d)
			};
		}
	}
	return null;
}

/**
 * Check if selection is at the very start of a list item's content.
 */
function atStartOfItem(state: import('prosemirror-state').EditorState): boolean {
	const { $from, empty } = state.selection;
	if (!empty) return false;
	if ($from.parentOffset !== 0) return false;

	const item = findListItem(state);
	if (!item) return false;

	// Must be in first textblock of the item
	const firstChild = item.node.firstChild;
	if (!firstChild?.isTextblock) return false;

	return $from.pos === item.start + 2; // +1 for list_item, +1 for paragraph
}

/**
 * Check if current item's text content is empty (may still have nested lists).
 */
function itemIsEmpty(state: import('prosemirror-state').EditorState): boolean {
	const item = findListItem(state);
	if (!item) return false;

	for (let i = 0; i < item.node.childCount; i++) {
		const child = item.node.child(i);
		// Only check textblocks - nested lists don't count as "content"
		if (child.isTextblock && child.textContent.length > 0) return false;
	}
	return true;
}

interface NestedListGroup {
	listType: NodeType;
	listAttrs: Record<string, unknown> | null;
	items: Node[];
}

function collectNestedListGroups(itemNode: Node): NestedListGroup[] {
	const groups: NestedListGroup[] = [];
	itemNode.forEach((child) => {
		if (!isListNode(child)) return;
		const items: Node[] = [];
		child.forEach((li) => items.push(li));
		if (items.length > 0) {
			groups.push({
				listType: child.type,
				listAttrs: child.attrs,
				items
			});
		}
	});
	return groups;
}

function collectNonListChildren(itemNode: Node): Node[] {
	const children: Node[] = [];
	itemNode.forEach((child) => {
		if (!isListNode(child)) children.push(child);
	});
	return children;
}

function replaceLastTextblock(node: Node, replacement: Node[]): Node | null {
	const children: Node[] = [];
	node.forEach((child) => children.push(child));

	for (let i = children.length - 1; i >= 0; i--) {
		if (children[i].isTextblock) {
			const newChildren: Node[] = [];
			for (let j = 0; j < children.length; j++) {
				if (j === i) newChildren.push(...replacement);
				else newChildren.push(children[j]);
			}
			return node.type.create(node.attrs, newChildren);
		}
		let hasTextblock = false;
		children[i].descendants((desc) => {
			if (desc.isTextblock) hasTextblock = true;
		});
		if (!hasTextblock) continue;

		const rebuilt = replaceLastTextblock(children[i], replacement);
		if (rebuilt) {
			const newChildren = children.map((c, j) => (j === i ? rebuilt : c));
			return node.type.create(node.attrs, newChildren);
		}
	}
	return null;
}

function getSelectedListPositions(state: import('prosemirror-state').EditorState): number[] {
	if (state.selection.empty) return [];
	const positions = new Set<number>();
	state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
		if (isListNode(node)) {
			positions.add(pos);
		}
	});
	return [...positions].sort((a, b) => a - b);
}

/**
 * Check if current item is nested inside another list item.
 */
function itemIsNested(state: import('prosemirror-state').EditorState): boolean {
	const { $from } = state.selection;
	const item = findListItem(state);
	if (!item) return false;

	// Look for another list_item above this one
	for (let d = item.depth - 2; d >= 0; d--) {
		if ($from.node(d).type === list_item) return true;
	}
	return false;
}

/**
 * Get index of current item in its parent list.
 * Accepts the item's depth directly to avoid a redundant findListItem call.
 */
function getItemIndex(state: import('prosemirror-state').EditorState, itemDepth: number): number {
	return state.selection.$from.index(itemDepth - 1);
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Join adjacent same-type lists and remove empty lists.
 */
export function cleanupLists(tr: Transaction): Transaction {
	// Join adjacent lists (reverse order for position stability)
	const joins: number[] = [];
	tr.doc.descendants((node, pos) => {
		if (isListNode(node)) {
			const after = pos + node.nodeSize;
			if (after < tr.doc.content.size) {
				const next = tr.doc.nodeAt(after);
				if (next?.type === node.type && canJoin(tr.doc, after)) {
					joins.push(after);
				}
			}
		}
	});
	for (let i = joins.length - 1; i >= 0; i--) {
		tr.join(joins[i]);
	}

	// Remove empty lists (collect all positions first, then delete in reverse order)
	const emptyLists: { pos: number; size: number }[] = [];
	tr.doc.descendants((node, pos) => {
		if (isListNode(node) && node.childCount === 0) {
			emptyLists.push({ pos, size: node.nodeSize });
		}
	});

	// Delete in reverse order to maintain position validity
	for (let i = emptyLists.length - 1; i >= 0; i--) {
		const { pos, size } = emptyLists[i];
		tr.delete(pos, pos + size);
	}

	return tr;
}

function delistItem(
	state: import('prosemirror-state').EditorState,
	dispatch?: (tr: Transaction) => void
): boolean {
	const item = findListItem(state);
	if (!item) return false;
	const { $from } = state.selection;
	const listDepth = item.depth - 1;
	const parentList = $from.node(listDepth);
	if (!isListNode(parentList)) return false;

	const listStart = $from.before(listDepth);
	const listEnd = $from.after(listDepth);
	const itemIndex = getItemIndex(state, item.depth);

	const itemContent = collectNonListChildren(item.node);
	if (itemContent.length === 0) {
		itemContent.push(paragraph.create());
	}
	const nestedGroups = collectNestedListGroups(item.node);

	const siblingsBefore: Node[] = [];
	const siblingsAfter: Node[] = [];
	for (let i = 0; i < parentList.childCount; i++) {
		if (i < itemIndex) siblingsBefore.push(parentList.child(i));
		else if (i > itemIndex) siblingsAfter.push(parentList.child(i));
	}

	if (!dispatch) return true;

	const tr = state.tr;
	const replacement: Node[] = [];
	let beforeListSize = 0;
	if (siblingsBefore.length > 0) {
		const beforeList = parentList.type.create(parentList.attrs, siblingsBefore);
		replacement.push(beforeList);
		beforeListSize = beforeList.nodeSize;
	}
	replacement.push(...itemContent);
	nestedGroups.forEach((group) => {
		replacement.push(group.listType.create(group.listAttrs, group.items));
	});
	if (siblingsAfter.length > 0) {
		replacement.push(parentList.type.create(parentList.attrs, siblingsAfter));
	}

	tr.replaceWith(listStart, listEnd, replacement);

	const mappedStart = tr.mapping.map(listStart);
	const contentStart = mappedStart + beforeListSize + 1;
	const nearSelection = TextSelection.near(tr.doc.resolve(contentStart), 1);
	tr.setSelection(nearSelection);

	cleanupLists(tr);
	dispatch(tr.scrollIntoView());
	return true;
}

// =============================================================================
// ENTER: Empty item → outdent or exit
// =============================================================================

export const enterOnEmptyItem: Command = (state, dispatch) => {
	if (!state.selection.empty) return false;
	if (!itemIsEmpty(state)) return false;

	const item = findListItem(state);
	if (!item) return false;

	// Nested: use standard lift (promotes children automatically)
	if (itemIsNested(state)) {
		return liftListItem(list_item)(state, dispatch);
	}

	// Top-level: de-list item
	return delistItem(state, dispatch);
};

// =============================================================================
// ENTER: At start of first filled item → Insert paragraph above
// =============================================================================

export const enterAtStartOfFirstItem: Command = (state, dispatch) => {
	if (!state.selection.empty) return false;
	if (!atStartOfItem(state)) return false;
	if (itemIsEmpty(state)) return false; // Empty items handled by enterOnEmptyItem

	const item = findListItem(state);
	if (!item) return false;

	const itemIndex = getItemIndex(state, item.depth);
	if (itemIndex !== 0) return false; // Only first item

	// Don't apply if nested - let splitListItem handle it
	if (itemIsNested(state)) return false;

	if (dispatch) {
		const { $from } = state.selection;
		const listDepth = item.depth - 1;
		const listStart = $from.before(listDepth);
		const tr = state.tr;

		// Insert an empty paragraph before the list
		const para = paragraph.create();
		tr.insert(listStart, para);

		// Cursor in the new paragraph
		tr.setSelection(TextSelection.create(tr.doc, listStart + 1));

		dispatch(tr.scrollIntoView());
	}
	return true;
};

// =============================================================================
// BACKSPACE: Join with previous or unwrap
// =============================================================================

export const backspaceInList: Command = (state, dispatch) => {
	if (!state.selection.empty) return false;
	if (!atStartOfItem(state)) return false;

	const item = findListItem(state);
	if (!item) return false;

	const { $from } = state.selection;
	const itemIndex = getItemIndex(state, item.depth);
	const listDepth = item.depth - 1;

	// === FIRST ITEM ===
	if (itemIndex === 0) {
		// Nested first item: lift to parent
		if (itemIsNested(state)) {
			return liftListItem(list_item)(state, dispatch);
		}

		return delistItem(state, dispatch);
	}

	// === CONDITION 3: Nested item → Outdent ===
	if (itemIsNested(state)) {
		return liftListItem(list_item)(state, dispatch);
	}

	// === CONDITION 4: Empty item → Convert to paragraph ===
	if (itemIsEmpty(state)) {
		return delistItem(state, dispatch);
	}

	// === CONDITION 5: Top-level with text → Merge with visually previous item ===
	if (!dispatch) return true;

	const tr = state.tr;
	const parentList = $from.node(listDepth);
	const listStart = $from.before(listDepth);
	const listEnd = $from.after(listDepth);
	const prevItem = parentList.child(itemIndex - 1);
	const currItem = item.node;

	// Find deepest last textblock in previous item's subtree
	let targetTextNode: Node | undefined;
	let targetRelPos = -1;
	prevItem.descendants((child, pos) => {
		if (child.isTextblock) {
			targetTextNode = child;
			targetRelPos = pos;
		}
	});
	if (!targetTextNode || targetRelPos < 0) return false;
	const targetText = targetTextNode;

	const currNonListChildren = collectNonListChildren(currItem);
	if (currNonListChildren.length === 0) return false;
	const currFirstNonList = currNonListChildren[0];
	if (!currFirstNonList.isTextblock) return false;
	const currRemainingNonList = currNonListChildren.slice(1);

	const mergedParagraph = paragraph.create(
		null,
		targetText.content.append(currFirstNonList.content)
	);
	const joinOffset = targetText.content.size;

	const newPrevItem = replaceLastTextblock(prevItem, [mergedParagraph, ...currRemainingNonList]);
	if (!newPrevItem) return false;

	const itemsBeforePrev: Node[] = [];
	const itemsAfterCurr: Node[] = [];
	for (let i = 0; i < parentList.childCount; i++) {
		if (i < itemIndex - 1) itemsBeforePrev.push(parentList.child(i));
		else if (i > itemIndex) itemsAfterCurr.push(parentList.child(i));
	}
	const currNestedGroups = collectNestedListGroups(currItem);

	const replacement: Node[] = [];
	const mergedListItems = [...itemsBeforePrev, newPrevItem, ...itemsAfterCurr];
	const mergedList = parentList.type.create(parentList.attrs, mergedListItems);
	replacement.push(mergedList);
	currNestedGroups.forEach((group) => {
		replacement.push(group.listType.create(group.listAttrs, group.items));
	});

	tr.replaceWith(listStart, listEnd, replacement);

	const mappedListStart = tr.mapping.map(listStart, 1);
	let mergedItemStart = mappedListStart + 1;
	for (const node of itemsBeforePrev) mergedItemStart += node.nodeSize;
	// mergedItemStart + 1 -> start of merged list_item content.
	// + targetRelPos -> start of replaced textblock relative to list_item content.
	// + 1 -> inside textblock content, then + joinOffset to the original text end.
	const cursorPos = mergedItemStart + 1 + targetRelPos + 1 + joinOffset;
	tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos), -1));

	cleanupLists(tr);
	dispatch(tr.scrollIntoView());
	return true;
};

/**
 * Join paragraph into preceding list (backspace at start of paragraph after list).
 */
export const joinParagraphIntoList: Command = (state, dispatch) => {
	const { $from, empty } = state.selection;

	if (!empty) return false;
	if ($from.parentOffset !== 0) return false;
	if ($from.parent.type !== paragraph) return false;

	// Check if there's a list right before this paragraph
	const before = $from.before();
	const $before = state.doc.resolve(before);
	const listBefore = $before.nodeBefore;

	if (!listBefore || !isListNode(listBefore)) return false;

	if (dispatch) {
		const tr = state.tr;

		// Find the last textblock in the list
		let lastTextPos = -1;
		let lastTextNode: Node | undefined;
		const listStart = before - listBefore.nodeSize;

		listBefore.descendants((node, pos) => {
			if (node.isTextblock) {
				lastTextPos = listStart + 1 + pos;
				lastTextNode = node;
			}
		});

		if (lastTextPos < 0 || !lastTextNode) return false;
		const lastText = lastTextNode; // For TypeScript narrowing

		// Merge paragraph content into the last textblock
		const paraContent = $from.parent.content;
		const mergedContent = lastText.content.append(paraContent);
		const mergedPara = paragraph.create(null, mergedContent);

		// Replace the last textblock
		tr.replaceWith(lastTextPos, lastTextPos + lastText.nodeSize, mergedPara);

		// Delete the paragraph
		const mappedParaStart = tr.mapping.map($from.before());
		const mappedParaEnd = tr.mapping.map($from.after());
		tr.delete(mappedParaStart, mappedParaEnd);

		// Cursor at join point: lastTextPos is the textblock open tag,
		// +1 enters the content, +content.size reaches the end of the original text
		const joinAnchorPos = lastTextPos + 1 + lastText.content.size;
		const mappedJoinPos = tr.mapping.map(joinAnchorPos, 1);
		tr.setSelection(TextSelection.near(tr.doc.resolve(mappedJoinPos), -1));

		cleanupLists(tr);
		dispatch(tr.scrollIntoView());
	}
	return true;
};

// =============================================================================
// TAB / SHIFT-TAB: Indent and Outdent
// =============================================================================

/**
 * Indent list item (Tab) - becomes child of previous sibling.
 * Uses standard sinkListItem with cleanup.
 */
export const indentListItem: Command = (state, dispatch) => {
	const item = findListItem(state);
	if (!item) return false;

	// Can't indent first item (no previous sibling to nest under)
	const itemIndex = getItemIndex(state, item.depth);
	if (itemIndex === 0) return false;

	// Use standard sink, but wrap to add cleanup
	if (!dispatch) {
		return sinkListItem(list_item)(state);
	}

	// Execute sink and capture the transaction
	let success = false;
	sinkListItem(list_item)(state, (tr) => {
		cleanupLists(tr);
		dispatch(tr.scrollIntoView());
		success = true;
	});

	return success;
};

/**
 * Outdent list item (Shift-Tab) - moves to parent level.
 * Uses standard liftListItem with cleanup.
 */
export const outdentListItem: Command = (state, dispatch) => {
	const item = findListItem(state);
	if (!item) return false;

	// Top-level outdent de-lists item
	if (!itemIsNested(state)) return delistItem(state, dispatch);

	// Use standard lift, but wrap to add cleanup
	if (!dispatch) {
		return liftListItem(list_item)(state);
	}

	let success = false;
	liftListItem(list_item)(state, (tr) => {
		cleanupLists(tr);
		dispatch(tr.scrollIntoView());
		success = true;
	});

	return success;
};

function inListType(state: import('prosemirror-state').EditorState, listType: NodeType): boolean {
	const item = findListItem(state);
	if (!item) return false;
	return state.selection.$from.node(item.depth - 1).type === listType;
}

function setListType(
	listType: NodeType,
	state: import('prosemirror-state').EditorState,
	dispatch?: (tr: Transaction) => void
): boolean {
	const selectedListPositions = getSelectedListPositions(state);
	if (selectedListPositions.length > 0) {
		const hasDifferentType = selectedListPositions.some((pos) => {
			const node = state.doc.nodeAt(pos);
			return !!node && isListNode(node) && node.type !== listType;
		});

		if (!hasDifferentType) {
			return delistItem(state, dispatch);
		}

		if (!dispatch) return true;
		const tr = state.tr;
		for (const pos of selectedListPositions) {
			const node = tr.doc.nodeAt(pos);
			if (node && isListNode(node) && node.type !== listType) {
				tr.setNodeMarkup(pos, listType, node.attrs);
			}
		}
		cleanupLists(tr);
		dispatch(tr.scrollIntoView());
		return true;
	}

	if (inListType(state, listType)) {
		return delistItem(state, dispatch);
	}

	const item = findListItem(state);
	if (item) {
		const parentListDepth = item.depth - 1;
		const parentList = state.selection.$from.node(parentListDepth);
		if (isListNode(parentList)) {
			if (!dispatch) return true;
			const listPos = state.selection.$from.before(parentListDepth);
			const tr = state.tr.setNodeMarkup(listPos, listType, parentList.attrs);
			cleanupLists(tr);
			dispatch(tr.scrollIntoView());
			return true;
		}
	}

	if (!dispatch) {
		return wrapInList(listType)(state);
	}

	let switched = false;
	wrapInList(listType)(state, (tr) => {
		cleanupLists(tr);
		dispatch(tr.scrollIntoView());
		switched = true;
	});
	return switched;
}

export const toggleBulletList: Command = (state, dispatch) =>
	setListType(bullet_list, state, dispatch);
export const toggleOrderedList: Command = (state, dispatch) =>
	setListType(ordered_list, state, dispatch);

// =============================================================================
// DELETE SELECTION WITH CLEANUP
// =============================================================================

export const deleteSelectionWithCleanup: Command = (state, dispatch) => {
	if (state.selection.empty) return false;

	let hasLists = false;
	state.doc.nodesBetween(state.selection.from, state.selection.to, (node) => {
		if (node.type === list_item || isListNode(node)) hasLists = true;
	});

	if (!hasLists) return false;

	if (dispatch) {
		const tr = state.tr.deleteSelection();
		cleanupLists(tr);
		dispatch(tr);
	}
	return true;
};

// =============================================================================
// SHIFT+ARROW: Extend selection across list item boundaries
// =============================================================================

/**
 * Shift+Arrow handler for extending selection across list item boundaries.
 *
 * When at the visual edge of a textblock inside a list item, the browser's
 * native Shift+Arrow can overshoot — jumping past list items instead of
 * moving one line at a time. This command intercepts that case and manually
 * computes the correct selection head position using ProseMirror coordinates.
 *
 * Must be registered for 'Shift-ArrowUp' and 'Shift-ArrowDown' in the keymap.
 */
export function shiftArrowInList(dir: 'up' | 'down'): Command {
	return (state, dispatch, view) => {
		if (!view) return false;
		if (!(state.selection instanceof TextSelection)) return false;

		const { $head } = state.selection;

		// Walk up from head: bail if inside a table cell, activate if inside a list item
		let inList = false;
		for (let d = $head.depth; d >= 0; d--) {
			const node = $head.node(d);
			const role = node.type.spec.tableRole;
			if (role === 'cell' || role === 'header_cell') return false;
			if (node.type === list_item) {
				inList = true;
				break;
			}
		}
		if (!inList) return false;

		// Must be at the visual edge of the current textblock
		if (!view.endOfTextblock(dir)) return false;

		// Find the nearest text position across the textblock boundary
		const boundaryPos = dir === 'up' ? $head.before() : $head.after();
		const $boundary = state.doc.resolve(boundaryPos);
		const targetSel = TextSelection.findFrom($boundary, dir === 'up' ? -1 : 1, true);
		if (!targetSel) return false;

		if (dispatch) {
			// Use coordinates to match horizontal position in the target line
			const headCoords = view.coordsAtPos(state.selection.head);
			const targetCoords = view.coordsAtPos(targetSel.head);
			const match = view.posAtCoords({ left: headCoords.left, top: targetCoords.top });
			const newHead = match ? match.pos : targetSel.head;

			const sel = TextSelection.create(state.doc, state.selection.anchor, newHead);
			dispatch(state.tr.setSelection(sel).scrollIntoView());
		}
		return true;
	};
}
