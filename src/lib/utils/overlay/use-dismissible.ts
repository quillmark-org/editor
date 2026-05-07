/**
 * Composable dismissal behavior for overlays
 * Handles ESC key, backdrop clicks, and outside clicks
 */

import { clickOutside } from '$lib/utils/use-click-outside';

export interface DismissibleConfig {
	/** Callback when ESC key pressed */
	onEscape?: () => void;
	/** Callback when backdrop clicked */
	onBackdrop?: () => void;
	/** Callback when clicked outside element */
	onOutside?: () => void;
	/** Callback when Cmd/Ctrl+Enter pressed */
	onSubmit?: () => void;
	/** Nodes to ignore for outside click detection */
	ignoreNodes?: (HTMLElement | undefined)[];
}

/**
 * Hook for dismissible behavior
 * Returns object with keyboard handler and optional click handler
 */
export function useDismissible(config: DismissibleConfig) {
	const { onEscape, onBackdrop, onOutside, onSubmit, ignoreNodes } = config;

	/**
	 * Keyboard handler for ESC key and Cmd/Ctrl+Enter
	 */
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && onEscape) {
			event.preventDefault();
			onEscape();
		}

		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && onSubmit) {
			event.preventDefault();
			onSubmit();
		}
	}

	/**
	 * Backdrop click handler
	 * Use with onclick on backdrop element
	 * Checks if click target is the backdrop itself (not a child)
	 */
	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget && onBackdrop) {
			onBackdrop();
		}
	}

	/**
	 * Outside click action
	 * Use as Svelte action: use:outsideClickAction
	 */
	function outsideClickAction(node: HTMLElement) {
		if (!onOutside) return { destroy: () => {} };
		return clickOutside(node, onOutside, ignoreNodes);
	}

	return {
		handleKeyDown,
		handleBackdropClick,
		outsideClickAction
	};
}
