<script lang="ts">
	/**
	 * SelectionToolbar - A contextual "Black Pill" popover that appears on text selection.
	 * Follows the "Notion Standard" positioning logic with top-center anchoring.
	 */
	import { onMount, onDestroy } from 'svelte';
	import {
		Bold,
		Italic,
		Underline,
		Strikethrough,
		Code,
		Link
	} from 'lucide-svelte';
	import Portal from '$lib/ui/portal.svelte';

	interface Props {
		/** Reference to the container element to monitor for selections */
		containerElement?: HTMLElement;
		/** Callback when a format action is triggered */
		onFormat: (type: string) => void;
	}

	let { containerElement, onFormat }: Props = $props();

	// Toolbar state
	let visible = $state(false);
	let position = $state({ top: 0, left: 0 });
	let flipped = $state(false);
	let scrollFramePending = false;

	// Constants from design spec
	const VERTICAL_OFFSET = 12;
	const FLIP_THRESHOLD = 60;
	const TOOLBAR_HEIGHT = 40; // Approximate height for flip calculations

	/**
	 * Get the anchor rect of the current selection
	 */
	function getSelectionRect(): DOMRect | null {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
			return null;
		}

		const range = selection.getRangeAt(0);
		const rects = range.getClientRects();
		if (rects.length > 0) {
			return rects[0];
		}
		return range.getBoundingClientRect();
	}

	/**
	 * Check if selection contains non-whitespace characters
	 */
	function hasNonWhitespaceSelection(): boolean {
		const selection = window.getSelection();
		if (!selection) return false;
		const text = selection.toString();
		return text.trim().length > 0;
	}

	/**
	 * Check if selection is within our container
	 */
	function isSelectionInContainer(): boolean {
		if (!containerElement) return false;
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return false;

		const range = selection.getRangeAt(0);
		return containerElement.contains(range.commonAncestorContainer);
	}

	/**
	 * Calculate toolbar position based on selection bounds
	 */
	function calculatePosition(rect: DOMRect): { top: number; left: number; flipped: boolean } {
		const scrollX = window.scrollX;
		const scrollY = window.scrollY;

		// Center horizontally on the selection
		const centerX = rect.left + rect.width / 2 + scrollX;

		// Determine if we need to flip (selection too close to top of viewport)
		const shouldFlip = rect.top < FLIP_THRESHOLD;

		let top: number;
		if (shouldFlip) {
			// Position below the selection
			top = rect.bottom + VERTICAL_OFFSET + scrollY;
		} else {
			// Position above the selection
			top = rect.top - VERTICAL_OFFSET - TOOLBAR_HEIGHT + scrollY;
		}

		return {
			top,
			left: centerX,
			flipped: shouldFlip
		};
	}

	/**
	 * Check if a table CellSelection is active (rows/columns selected via drag handles).
	 * prosemirror-tables adds .selectedCell to each cell in a CellSelection.
	 */
	function isCellSelectionActive(): boolean {
		if (!containerElement) return false;
		return containerElement.querySelector('.selectedCell') !== null;
	}

	/**
	 * Show the toolbar at the current selection
	 */
	function showToolbar() {
		// Disable on touch devices (phones/tablets)
		if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
			hideToolbar();
			return;
		}

		// Suppress toolbar when table drag handles create a CellSelection
		if (isCellSelectionActive()) {
			hideToolbar();
			return;
		}

		if (!isSelectionInContainer() || !hasNonWhitespaceSelection()) {
			hideToolbar();
			return;
		}

		const rect = getSelectionRect();
		if (!rect) {
			hideToolbar();
			return;
		}

		const pos = calculatePosition(rect);
		position = { top: pos.top, left: pos.left };
		flipped = pos.flipped;
		visible = true;
	}

	/**
	 * Hide the toolbar
	 */
	function hideToolbar() {
		visible = false;
		scrollFramePending = false;
	}

	/**
	 * Handle mouseup to show toolbar for mouse selections.
	 * Only triggers when the mouseup occurred within the editor container — clicking
	 * outside (buttons, section headers, etc.) does not clear the browser selection,
	 * so we must guard here rather than relying solely on handleMouseDown.
	 */
	function handleMouseUp(event: MouseEvent) {
		if (!containerElement) return;
		const target = event.target as Node;
		if (!containerElement.contains(target)) return;
		// Small delay to let the selection finalize
		requestAnimationFrame(() => {
			showToolbar();
		});
	}

	/**
	 * Handle mousedown to dismiss toolbar when clicking outside
	 */
	function handleMouseDown(event: MouseEvent) {
		// Check if click is on the toolbar itself
		const target = event.target as HTMLElement;
		if (target.closest('.selection-toolbar')) {
			return;
		}
		hideToolbar();
	}

	/**
	 * Handle keydown - dismiss toolbar for all keyboard input
	 */
	function handleKeyDown(_event: KeyboardEvent) {
		hideToolbar();
	}

	/**
	 * Handle focus leaving the editor container
	 */
	function handleContainerFocusOut() {
		requestAnimationFrame(() => {
			const activeElement = document.activeElement as HTMLElement | null;
			if (activeElement?.closest('.selection-toolbar')) {
				return;
			}
			if (containerElement && activeElement && containerElement.contains(activeElement)) {
				return;
			}
			hideToolbar();
		});
	}

	/**
	 * Handle page visibility changes
	 */
	function handleVisibilityChange() {
		if (document.visibilityState !== 'visible') {
			hideToolbar();
		}
	}

	/**
	 * Handle window resize to dismiss toolbar
	 */
	function handleResize() {
		hideToolbar();
	}

	/**
	 * Handle format button click
	 */
	function handleFormatClick(type: string, event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		onFormat(type);
		// Keep toolbar visible and update active states
		requestAnimationFrame(() => {
			if (hasNonWhitespaceSelection() && isSelectionInContainer()) {
				// Toolbar stays visible, Svelte will re-render with updated active states
			} else {
				hideToolbar();
			}
		});
	}

	/**
	 * Handle scroll to reposition toolbar
	 */
	function handleScroll() {
		if (!visible) return;
		if (scrollFramePending) return;
		scrollFramePending = true;
		requestAnimationFrame(() => {
			scrollFramePending = false;
			if (!visible) return;
			showToolbar();
		});
	}

	// Setup and teardown event listeners
	onMount(() => {
		document.addEventListener('mouseup', handleMouseUp);
		document.addEventListener('mousedown', handleMouseDown);
		document.addEventListener('keydown', handleKeyDown);
		document.addEventListener('visibilitychange', handleVisibilityChange);
		containerElement?.addEventListener('focusout', handleContainerFocusOut);
		window.addEventListener('resize', handleResize);
		window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
	});

	onDestroy(() => {
		document.removeEventListener('mouseup', handleMouseUp);
		document.removeEventListener('mousedown', handleMouseDown);
		document.removeEventListener('keydown', handleKeyDown);
		document.removeEventListener('visibilitychange', handleVisibilityChange);
		containerElement?.removeEventListener('focusout', handleContainerFocusOut);
		window.removeEventListener('resize', handleResize);
		window.removeEventListener('scroll', handleScroll, { capture: true });
	});

	// Format button definitions
	const formatButtons = [
		{ type: 'bold', icon: Bold, title: 'Bold', mark: 'strong' },
		{ type: 'italic', icon: Italic, title: 'Italic', mark: 'em' },
		{ type: 'underline', icon: Underline, title: 'Underline', mark: 'underline' },
		{ type: 'strikethrough', icon: Strikethrough, title: 'Strikethrough', mark: 'strikethrough' },
		{ type: 'code', icon: Code, title: 'Code', mark: 'code' },
		{ type: 'link', icon: Link, title: 'Link', mark: 'link' }
	];
</script>

{#if visible}
	<Portal>
		<div
			class="selection-toolbar"
			class:flipped
			style="top: {position.top}px; left: {position.left}px;"
			role="toolbar"
			aria-label="Text formatting"
		>
			{#each formatButtons as btn (btn.type)}
				<button
					type="button"
					class="toolbar-btn"
					title={btn.title}
					onmousedown={(e) => handleFormatClick(btn.type, e)}
				>
					<btn.icon size={16} strokeWidth={2} />
				</button>
			{/each}
		</div>
	</Portal>
{/if}

<style>
	.selection-toolbar {
		position: absolute;
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px 6px;

		/* The Pill Aesthetic - uses semantic colors for theme support */
		background-color: color-mix(in srgb, var(--qm-primary) 80%, transparent);
		backdrop-filter: blur(4px);
		border-radius: var(--radius-lg);
		box-shadow: 0px 2px 8px var(--qm-foreground-shadow);

		/* Center on the calculated position */
		transform: translateX(-50%);

		/* Quick snap animation */
		animation: toolbar-enter 150ms ease-out;

		/* Z-index above content */
		z-index: var(--z-popover, 1100);

		/* Prevent text selection on toolbar */
		user-select: none;

		/* Smooth theme transition */
		transition: background-color 200ms ease-in-out, box-shadow 200ms ease-in-out;
	}

	:global(.dark) .selection-toolbar {
		box-shadow: 0px 1px 4px rgb(0 0 0 / 0.5);
	}



	@keyframes toolbar-enter {
		from {
			opacity: 0;
			transform: translateX(-50%) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) scale(1);
		}
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--qm-primary-foreground);
		border-radius: 6px;
		cursor: pointer;
		transition: background-color 100ms ease, color 200ms ease-in-out;
	}

	.toolbar-btn:hover {
		background-color: color-mix(in srgb, var(--qm-primary-foreground) 15%, transparent);
	}

	.toolbar-btn:active {
		background-color: color-mix(in srgb, var(--qm-primary-foreground) 25%, transparent);
	}



	.toolbar-btn:focus-visible {
		outline: 2px solid var(--qm-ring);
		outline-offset: -2px;
	}
</style>
