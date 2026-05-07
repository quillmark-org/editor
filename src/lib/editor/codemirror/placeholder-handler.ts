/**
 * Click handler for markdown placeholders
 * Detects clicks on placeholder decorations and selects the text range
 * for easy "type-to-replace" editing.
 */

import { EditorView } from '@codemirror/view';
import { PLACEHOLDER_REGEX } from '$lib/editor/shared/placeholder-patterns';

// Module-level state to track pre-click selection
let preClickSelection: { from: number; to: number } | null = null;
let isDragSelection = false;
let mouseDownPos: { x: number; y: number } | null = null;

/**
 * Creates a click handler facet for placeholder interactions
 * Selects the entire placeholder ({:...:}) when clicked.
 *
 * Rules:
 * - If cursor was outside the placeholder before clicking, select entire placeholder
 * - Never trigger on drag-selection
 * - If selection was already inside placeholder, use default click behavior
 */
export const placeholderClickHandler = EditorView.domEventHandlers({
	mousedown: (event: MouseEvent, view: EditorView) => {
		// Capture the current selection before click processing
		const sel = view.state.selection.main;
		preClickSelection = {
			from: Math.min(sel.from, sel.to),
			to: Math.max(sel.from, sel.to)
		};
		isDragSelection = false;
		mouseDownPos = { x: event.clientX, y: event.clientY };
		return false; // Don't prevent default
	},

	mouseup: (event: MouseEvent, _view: EditorView) => {
		if (mouseDownPos) {
			const dx = Math.abs(event.clientX - mouseDownPos.x);
			const dy = Math.abs(event.clientY - mouseDownPos.y);
			// If mouse moved more than a few pixels, it's a drag
			isDragSelection = dx > 5 || dy > 5;
		}
		return false; // Don't prevent default
	},

	click: (event: MouseEvent, view: EditorView) => {
		const target = event.target as HTMLElement;

		// Check if clicked element or its parent has the placeholder class
		const placeholderElement = target.closest('.cm-markdown-placeholder');
		if (!placeholderElement) {
			return false; // Not a placeholder click, let event continue
		}

		// Never trigger on drag selections
		if (isDragSelection) {
			return false;
		}

		// Get the document position from the click location
		const pos = view.posAtDOM(placeholderElement);
		if (pos === null) {
			return false;
		}

		// Find the placeholder boundaries by scanning for {: and :}
		const doc = view.state.doc;
		const line = doc.lineAt(pos);
		const lineText = line.text;
		const posInLine = pos - line.from;

		// Find all placeholders in the line using shared regex
		const matches = Array.from(lineText.matchAll(PLACEHOLDER_REGEX));

		// Find which match contains our position
		const match = matches.find((m) => {
			const start = m.index!;
			const end = start + m[0].length;
			return posInLine >= start && posInLine <= end; // Check if click is within bounds
		});

		if (!match) {
			return false;
		}

		const startIdx = match.index!;
		const endIdx = startIdx + match[0].length; // index after :)

		const from = line.from + startIdx;
		const to = line.from + endIdx;

		// Use the pre-click selection state (captured on mousedown)
		const preSel = preClickSelection;
		if (!preSel) return false;

		// Check if the pre-click selection/cursor was entirely inside this placeholder
		const wasInsidePlaceholder = preSel.from >= from && preSel.to <= to;

		// If already inside the placeholder, use default click behavior (move cursor)
		if (wasInsidePlaceholder) {
			return false;
		}

		// Cursor/selection was outside - select the entire placeholder
		event.preventDefault();

		view.dispatch({
			selection: { anchor: from, head: to },
			scrollIntoView: true
		});

		view.focus();

		return true; // Event handled
	}
});
