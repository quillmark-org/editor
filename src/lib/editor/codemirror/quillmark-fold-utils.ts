import type { EditorView } from '@codemirror/view';
import { foldEffect, unfoldEffect, foldedRanges } from '@codemirror/language';
import { findMetadataBlocks } from './quillmark-patterns';

/**
 * Fold a single metadata block at the given position
 */
export function foldMetadataBlockAtPosition(view: EditorView, pos: number): boolean {
	const doc = view.state.doc;
	const blocks = findMetadataBlocks(doc);

	// Find the block that contains this position
	const block = blocks.find((b) => pos >= b.from && pos <= b.to);

	if (block) {
		view.dispatch({
			effects: foldEffect.of({ from: block.from, to: block.to })
		});
		return true;
	}

	return false;
}

/**
 * Toggle the fold state of the metadata block at the cursor position.
 * - If cursor is inside an unfolded metadata block, fold it
 * - If cursor is on a line with a folded metadata block placeholder, unfold it
 * - Returns true if action was taken, false otherwise
 */
export function toggleMetadataBlockAtCursor(view: EditorView): boolean {
	const state = view.state;
	const doc = state.doc;
	const cursorPos = state.selection.main.head;
	const cursorLine = doc.lineAt(cursorPos);

	// Get currently folded ranges
	const folded = foldedRanges(state);

	// Find all metadata blocks
	const metadataBlocks = findMetadataBlocks(doc);

	// Build a Set of metadata block ranges for O(1) lookup
	const metadataRanges = new Set(metadataBlocks.map((b) => `${b.from}-${b.to}`));

	// Check if cursor is on a line with a folded metadata block
	// When folded, the entire block is collapsed onto the line containing the opening ---
	let foldToUnfold: { from: number; to: number } | null = null;
	folded.between(0, doc.length, (from, to) => {
		// Check if this fold starts on the cursor line
		const foldStartLine = doc.lineAt(from);
		if (foldStartLine.number === cursorLine.number) {
			// Verify this is a metadata block fold using Set lookup
			if (metadataRanges.has(`${from}-${to}`)) {
				foldToUnfold = { from, to };
				return false; // Stop iteration
			}
		}
	});

	if (foldToUnfold) {
		// Unfold the block
		view.dispatch({
			effects: unfoldEffect.of(foldToUnfold)
		});
		return true;
	}

	// Check if cursor is inside an unfolded metadata block
	const containingBlock = metadataBlocks.find(
		(block) => cursorPos >= block.from && cursorPos <= block.to
	);

	if (containingBlock) {
		// Check if this block is already folded
		let isAlreadyFolded = false;
		folded.between(containingBlock.from, containingBlock.to, (from, to) => {
			if (from === containingBlock.from && to === containingBlock.to) {
				isAlreadyFolded = true;
				return false;
			}
		});

		if (!isAlreadyFolded) {
			// Fold the block
			view.dispatch({
				effects: foldEffect.of({ from: containingBlock.from, to: containingBlock.to })
			});
			return true;
		}
	}

	return false;
}

/**
 * Fold all metadata blocks (unconditionally)
 * This is useful for auto-folding when loading documents
 */
export function foldAllMetadataBlocks(view: EditorView): void {
	const state = view.state;
	const doc = state.doc;
	const effects = [];

	// Get currently folded ranges
	const folded = foldedRanges(state);

	// Find all metadata blocks
	const metadataBlocks = findMetadataBlocks(doc);

	// First unfold any existing folds in the metadata regions to prevent duplicates
	for (const block of metadataBlocks) {
		folded.between(block.from, block.to, (from, to) => {
			effects.push(unfoldEffect.of({ from, to }));
		});
	}

	// Then fold all metadata blocks
	for (const block of metadataBlocks) {
		effects.push(foldEffect.of({ from: block.from, to: block.to }));
	}

	// Apply all effects at once
	if (effects.length > 0) {
		view.dispatch({ effects });
	}
}

/**
 * Toggle all metadata blocks (fold if any are expanded, unfold if all are folded)
 */
export function toggleAllMetadataBlocks(view: EditorView): void {
	const state = view.state;
	const doc = state.doc;
	const effects = [];

	// Get currently folded ranges
	const folded = foldedRanges(state);

	// Find all metadata blocks
	const metadataBlocks = findMetadataBlocks(doc);

	// Check if ALL metadata blocks are currently folded
	let allFolded = metadataBlocks.length > 0;
	for (const block of metadataBlocks) {
		let isFolded = false;
		folded.between(block.from, block.to, (from, to) => {
			// Check for exact fold match
			if (from === block.from && to === block.to) {
				isFolded = true;
				return false;
			}
		});
		if (!isFolded) {
			allFolded = false;
			break;
		}
	}

	// Toggle: if ALL are folded, unfold all. Otherwise, fold all.
	if (allFolded) {
		// Unfold all metadata blocks - use exact fold ranges to avoid duplicates
		for (const block of metadataBlocks) {
			folded.between(block.from, block.to, (from, to) => {
				effects.push(unfoldEffect.of({ from, to }));
			});
		}
	} else {
		// First unfold any existing folds in the metadata regions to prevent duplicates
		for (const block of metadataBlocks) {
			folded.between(block.from, block.to, (from, to) => {
				effects.push(unfoldEffect.of({ from, to }));
			});
		}
		// Then fold all metadata blocks
		for (const block of metadataBlocks) {
			effects.push(foldEffect.of({ from: block.from, to: block.to }));
		}
	}

	// Apply all effects at once
	if (effects.length > 0) {
		view.dispatch({ effects });
	}

	view.focus();
}
