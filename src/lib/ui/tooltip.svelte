<script lang="ts">
	import Portal from '$lib/ui/portal.svelte';
	import { usePositioning } from '$lib/utils/overlay/use-positioning';
	import type { Snippet } from 'svelte';

	interface TooltipProps {
		/** Tooltip content */
		content: string;

		/** Position of tooltip */
		position?: 'top' | 'bottom' | 'left' | 'right';

		/** Delay before showing (ms) */
		delay?: number;

		/** Long-press duration for touch devices (ms) */
		longPressDelay?: number;

		/** Max width of tooltip */
		maxWidth?: string;

		/** Gap between trigger and tooltip (px) */
		offset?: number;

		/** Additional CSS classes */
		class?: string;

		/** Trigger element snippet */
		children?: Snippet;
	}

	let {
		content,
		position = 'right',
		delay = 100,
		longPressDelay = 500,
		maxWidth = '400px',
		offset = 8,
		class: className,
		children
	}: TooltipProps = $props();

	// State
	let visible = $state(false);
	let showTimeout: ReturnType<typeof setTimeout> | null = null;
	let longPressTimeout: ReturnType<typeof setTimeout> | null = null;
	let longPressTriggered = false;
	let touchActive = false;
	let triggerRef = $state<HTMLElement | null>(null);
	let tooltipRef = $state<HTMLDivElement | null>(null);
	let tooltipPosition = $state({ top: 0, left: 0 });

	// --- Desktop: hover ---
	function handleMouseEnter() {
		// Suppress synthetic hover events fired after touch interactions
		if (touchActive) return;
		showTimeout = setTimeout(() => {
			visible = true;
		}, delay);
	}

	function handleMouseLeave() {
		if (touchActive) return;
		if (showTimeout) {
			clearTimeout(showTimeout);
			showTimeout = null;
		}
		visible = false;
	}

	// --- Touch: long-press ---
	function handleTouchStart(e: TouchEvent) {
		touchActive = true;
		longPressTriggered = false;
		longPressTimeout = setTimeout(() => {
			longPressTriggered = true;
			// Prevent text selection that started during the hold
			e.preventDefault();
			visible = true;
		}, longPressDelay);
	}

	function handleTouchEnd(e: TouchEvent) {
		if (longPressTimeout) {
			clearTimeout(longPressTimeout);
			longPressTimeout = null;
		}
		// If long-press triggered, prevent the tap from also firing click
		if (longPressTriggered) {
			e.preventDefault();
		}
	}

	function handleTouchMove() {
		// Cancel long-press if finger moves
		if (longPressTimeout) {
			clearTimeout(longPressTimeout);
			longPressTimeout = null;
		}
	}

	// Dismiss tooltip when tapping anywhere (touch)
	function handleDocumentTouch() {
		visible = false;
	}

	$effect(() => {
		if (visible && longPressTriggered) {
			// Use a microtask to avoid the current touchend from immediately dismissing
			queueMicrotask(() => {
				document.addEventListener('touchstart', handleDocumentTouch, { once: true });
			});
			return () => document.removeEventListener('touchstart', handleDocumentTouch);
		}
	});

	// Update position when visible changes
	$effect(() => {
		if (visible && triggerRef && tooltipRef) {
			const positioning = usePositioning({
				strategy: 'relative',
				anchor: triggerRef,
				side: position,
				align: 'center',
				offset
			});

			// Initial position
			tooltipPosition = positioning.calculatePosition(tooltipRef);

			// Setup tracking (scroll/resize)
			return positioning.setupPositionTracking(tooltipRef, (newPos) => {
				tooltipPosition = newPos;
			});
		}
	});
</script>

<div class="qm-tooltip-wrapper">
	<div
		bind:this={triggerRef}
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		ontouchstart={handleTouchStart}
		ontouchend={handleTouchEnd}
		ontouchmove={handleTouchMove}
		class="qm-tooltip-trigger"
		role="presentation"
	>
		{#if children}
			{@render children()}
		{/if}
	</div>

	{#if visible}
		<Portal>
			<div
				bind:this={tooltipRef}
				role="tooltip"
				ontouchstart={(e) => {
					e.stopPropagation();
					e.preventDefault();
					visible = false;
				}}
				class="qm-tooltip {className ?? ''}"
				style="top: {tooltipPosition.top}px; left: {tooltipPosition.left}px; max-width: {maxWidth};"
			>
				{content}
			</div>
		</Portal>
	{/if}
</div>

<style>
	.qm-tooltip-wrapper {
		position: relative;
		display: inline-block;
	}
	.qm-tooltip-trigger {
		display: inline-block;
		user-select: none;
		touch-action: manipulation;
	}
	:global(.qm-tooltip) {
		position: fixed;
		z-index: var(--qm-z-popover);
		padding: 0.375rem 0.625rem;
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--qm-foreground);
		background: var(--qm-surface-elevated);
		border: 1px solid var(--qm-border);
		border-radius: var(--qm-radius-sm);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
		animation: qm-tooltip-in 0.12s ease-out;
		pointer-events: auto;
	}
	@keyframes qm-tooltip-in {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
