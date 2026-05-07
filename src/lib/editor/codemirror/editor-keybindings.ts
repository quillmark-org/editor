/**
 * Editor keybindings for markdown editing.
 * Extracted from MarkdownEditor.svelte for better testability and reuse.
 */
import { keymap, type KeyBinding } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

/**
 * Options for creating the complete editor keymap
 */
export interface EditorKeymapOptions {
	onBold?: () => void;
	onItalic?: () => void;
	onUnderline?: () => void;
	onToggleFrontmatter?: () => void;
}

/**
 * Creates keybindings for list continuation on Enter.
 * - Continues unordered lists (-, *, +) with same marker and indentation
 * - Continues ordered lists (1., 2., etc.) with incremented number
 * - Removes empty list items on second Enter
 * - Preserves indentation for regular lines
 */
export function createListContinuationKeymap(): KeyBinding {
	return {
		key: 'Enter',
		run: (view) => {
			const state = view.state;
			const selection = state.selection.main;

			// Only handle single cursor (not multi-cursor selections)
			if (!selection.empty) return false;

			const line = state.doc.lineAt(selection.from);
			const lineText = line.text;

			// Check for unordered list: leading whitespace + bullet marker (-, *, +) + space
			const unorderedMatch = lineText.match(/^(\s*)([-*+])\s(.*)$/);
			if (unorderedMatch) {
				const [, indent, marker, content] = unorderedMatch;
				// If list item is empty, remove the marker and create a blank line
				if (!content.trim()) {
					view.dispatch({
						changes: { from: line.from, to: line.to, insert: '' }
					});
					return true;
				}
				// Continue the list with same marker and indentation
				view.dispatch({
					changes: { from: selection.from, insert: `\n${indent}${marker} ` },
					selection: { anchor: selection.from + indent.length + 3 }
				});
				return true;
			}

			// Check for ordered list: leading whitespace + number + . + space
			const orderedMatch = lineText.match(/^(\s*)(\d+)\.\s(.*)$/);
			if (orderedMatch) {
				const [, indent, num, content] = orderedMatch;
				// If list item is empty, remove the marker and create a blank line
				if (!content.trim()) {
					view.dispatch({
						changes: { from: line.from, to: line.to, insert: '' }
					});
					return true;
				}
				// Continue the list with incremented number
				const nextNum = parseInt(num, 10) + 1;
				const newMarker = `${nextNum}. `;
				const newLineInsert = `\n${indent}${newMarker}`;

				// Build changes array: first the new line insertion
				const changes: { from: number; to: number; insert: string }[] = [
					{ from: selection.from, to: selection.from, insert: newLineInsert }
				];

				// Renumber subsequent list items with the same indentation
				const doc = state.doc;
				let currentLineNum = line.number + 1;
				let expectedNum = nextNum + 1;

				while (currentLineNum <= doc.lines) {
					const nextLine = doc.line(currentLineNum);
					const nextLineMatch = nextLine.text.match(/^(\s*)(\d+)\.\s(.*)$/);

					if (!nextLineMatch) {
						// Not a numbered list item, stop renumbering
						break;
					}

					const [, nextIndent, nextNumStr] = nextLineMatch;

					// Only renumber items at the same indentation level
					if (nextIndent !== indent) {
						break;
					}

					const currentNum = parseInt(nextNumStr, 10);
					if (currentNum !== expectedNum) {
						// Replace the number in this line
						const numStart = nextLine.from + nextIndent.length;
						const numEnd = numStart + nextNumStr.length;
						changes.push({
							from: numStart,
							to: numEnd,
							insert: String(expectedNum)
						});
					}

					expectedNum++;
					currentLineNum++;
				}

				view.dispatch({
					changes,
					selection: { anchor: selection.from + 1 + indent.length + newMarker.length }
				});
				return true;
			}

			// Not a list item - preserve indentation for regular lines
			const indentMatch = lineText.match(/^(\s*)/);
			const indent = indentMatch ? indentMatch[1] : '';
			if (indent) {
				view.dispatch({
					changes: { from: selection.from, insert: `\n${indent}` },
					selection: { anchor: selection.from + 1 + indent.length }
				});
				return true;
			}

			// No indentation to preserve, let default behavior handle it
			return false;
		}
	};
}

/**
 * Creates keybindings for Tab indentation (2 spaces).
 * Handles both single cursor and multi-line selections.
 */
export function createTabIndentKeymap(): KeyBinding {
	return {
		key: 'Tab',
		run: (view) => {
			const state = view.state;
			const selection = state.selection.main;
			const startLine = state.doc.lineAt(selection.from);
			const endLine = state.doc.lineAt(selection.to);

			// Build changes for all lines in selection
			const changes: { from: number; insert: string }[] = [];
			for (let i = startLine.number; i <= endLine.number; i++) {
				const line = state.doc.line(i);
				changes.push({ from: line.from, insert: '  ' });
			}

			// Calculate new selection bounds
			const linesCount = endLine.number - startLine.number + 1;
			view.dispatch({
				changes,
				selection: {
					anchor: selection.from + 2,
					head: selection.to + linesCount * 2
				}
			});
			return true;
		}
	};
}

/**
 * Creates keybindings for Shift-Tab unindentation (remove up to 2 spaces).
 * Handles both single cursor and multi-line selections.
 */
export function createShiftTabUnindentKeymap(): KeyBinding {
	return {
		key: 'Shift-Tab',
		run: (view) => {
			const state = view.state;
			const selection = state.selection.main;
			const startLine = state.doc.lineAt(selection.from);
			const endLine = state.doc.lineAt(selection.to);

			// Build changes for all lines in selection
			const changes: { from: number; to: number; insert: string }[] = [];
			let totalRemoved = 0;
			let firstLineRemoved = 0;

			for (let i = startLine.number; i <= endLine.number; i++) {
				const line = state.doc.line(i);
				const lineText = line.text;
				const spacesToRemove = lineText.startsWith('  ') ? 2 : lineText.startsWith(' ') ? 1 : 0;
				if (spacesToRemove > 0) {
					changes.push({ from: line.from, to: line.from + spacesToRemove, insert: '' });
					totalRemoved += spacesToRemove;
					if (i === startLine.number) {
						firstLineRemoved = spacesToRemove;
					}
				}
			}

			if (changes.length > 0) {
				view.dispatch({
					changes,
					selection: {
						anchor: Math.max(startLine.from, selection.from - firstLineRemoved),
						head: Math.max(startLine.from, selection.to - totalRemoved)
					}
				});
			}
			return true;
		}
	};
}

/**
 * Creates keybindings for formatting shortcuts (Cmd/Ctrl + B, I, U).
 */
export function createFormattingKeymaps(options: EditorKeymapOptions): KeyBinding[] {
	const bindings: KeyBinding[] = [];

	if (options.onBold) {
		bindings.push({
			key: 'Mod-b',
			run: () => {
				options.onBold!();
				return true;
			}
		});
	}

	if (options.onItalic) {
		bindings.push({
			key: 'Mod-i',
			run: () => {
				options.onItalic!();
				return true;
			}
		});
	}

	if (options.onUnderline) {
		bindings.push({
			key: 'Mod-u',
			run: () => {
				options.onUnderline!();
				return true;
			}
		});
	}

	return bindings;
}

/**
 * Creates keybinding for toggling frontmatter fold (Cmd/Ctrl + .).
 */
export function createToggleFrontmatterKeymap(onToggle?: () => void): KeyBinding | null {
	if (!onToggle) return null;

	return {
		key: 'Mod-.',
		run: () => {
			onToggle();
			return true;
		}
	};
}

/**
 * Creates the complete editor keymap extension combining all keybindings.
 * This should be placed BEFORE defaultKeymap in the extension list to take priority.
 */
export function createEditorKeymaps(options: EditorKeymapOptions = {}): Extension {
	const bindings: KeyBinding[] = [
		createListContinuationKeymap(),
		createTabIndentKeymap(),
		createShiftTabUnindentKeymap(),
		...createFormattingKeymaps(options)
	];

	const toggleBinding = createToggleFrontmatterKeymap(options.onToggleFrontmatter);
	if (toggleBinding) bindings.push(toggleBinding);

	return keymap.of(bindings);
}
