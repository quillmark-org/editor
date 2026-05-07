<script lang="ts">
	import { X } from 'lucide-svelte';
	import Button from '$lib/ui/button.svelte';
	import Portal from '$lib/ui/portal.svelte';
	import { useDismissible } from '$lib/utils/overlay/use-dismissible';
	import { useZIndex } from '$lib/utils/overlay/use-zindex';
	import { usePositioning } from '$lib/utils/overlay/use-positioning';
	import { generateUniqueId } from '$lib/utils/unique-id';

	interface PopoverProps {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		/**
		 * Popover title for accessibility (optional)
		 * @default undefined
		 */
		title?: string;
		/**
		 * A base popover component.
		 * @default true
		/** Whether popover should close on Escape key press*/
		closeOnEscape?: boolean;
		/**
		 * Whether popover should close on outside click
		 * @default true
		 */
		closeOnOutsideClick?: boolean;
		/**
		 * Whether to show a close button in the top-right corner
		 * @default false
		 */
		showCloseButton?: boolean;
		/**
		 * Popover side relative to trigger element
		 * @default 'bottom'
		 */
		side?: 'top' | 'right' | 'bottom' | 'left';
		/**
		 * Popover alignment relative to trigger element
		 * @default 'center'
		 */
		align?: 'start' | 'center' | 'end';
		/**
		 * Offset in pixels from the trigger element
		 * @default 8
		 */
		sideOffset?: number;
		class?: string;
		style?: string;
		trigger: import('svelte').Snippet;
		content: import('svelte').Snippet;
		header?: import('svelte').Snippet;
		footer?: import('svelte').Snippet;
		/**
		 * Whether to disable default content padding
		 * @default false
		 */
		disablePadding?: boolean;
	}

	let {
		open = $bindable(false),
		onOpenChange,
		title,
		closeOnEscape = true,
		closeOnOutsideClick = true,
		showCloseButton = false,
		side = 'bottom',
		align = 'center',
		sideOffset = 8,
		class: className,
		style,
		trigger,
		content,
		header,
		footer,
		disablePadding = false
	}: PopoverProps = $props();

	let triggerElement: HTMLElement | undefined = $state();
	let popoverElement: HTMLElement | undefined = $state();
	let position = $state({ top: 0, left: 0 });

	// Generate unique ID for ARIA
	const baseId = generateUniqueId();
	const titleId = $derived(title ? `popover-title-${baseId}` : undefined);

	// Close handler
	function handleClose() {
		open = false;
		onOpenChange?.(false);
	}

	// Composable hooks - use $derived to reactively capture props
	const dismissible = $derived(
		useDismissible({
			onEscape: closeOnEscape
				? () => {
						open = false;
						onOpenChange?.(false);
					}
				: undefined,
			onOutside: closeOnOutsideClick
				? () => {
						open = false;
						onOpenChange?.(false);
					}
				: undefined,
			ignoreNodes: [triggerElement]
		})
	);

	const zIndex = useZIndex({
		layer: 'popover',
		onClose: () => {
			open = false;
			onOpenChange?.(false);
		}
	});

	// Register/unregister with overlay store for coordination
	$effect(() => {
		if (open) {
			return zIndex.registerEffect();
		}
	});

	// Position tracking when open
	$effect(() => {
		if (open && popoverElement && triggerElement) {
			const positioning = usePositioning({
				strategy: 'relative',
				anchor: triggerElement,
				side,
				align,
				offset: sideOffset
			});

			return positioning.setupPositionTracking(popoverElement, (newPosition) => {
				position = newPosition;
			});
		}
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- The onclick handler is intentionally placed on the wrapper div to capture clicks
     from the trigger content (which typically contains buttons with proper keyboard handling) -->
<div
	bind:this={triggerElement}
	onclick={() => {
		open = !open;
		onOpenChange?.(open);
	}}
>
	{@render trigger()}
</div>

{#if open}
	<Portal>
		<div
			bind:this={popoverElement}
			class="qm-popover {className ?? ''}"
			class:qm-popover-padded={!disablePadding}
			style="top: {position.top}px; left: {position.left}px; z-index: var(--qm-z-popover); {style ||
				''}"
			role="dialog"
			aria-labelledby={titleId}
			tabindex="-1"
			onkeydown={dismissible.handleKeyDown}
			use:dismissible.outsideClickAction
		>
			{#if title || showCloseButton || header}
				<div class="qm-popover-header">
					{#if header}
						{@render header()}
					{:else if title}
						<h3 id={titleId} class="qm-popover-title">{title}</h3>
					{/if}

					{#if showCloseButton}
						<Button
							variant="ghost"
							size="icon"
							onclick={handleClose}
							aria-label="Close popover"
						>
							<X size={14} />
						</Button>
					{/if}
				</div>
			{/if}

			<div class="qm-popover-content" class:qm-no-pad={disablePadding}>
				{@render content()}
			</div>

			{#if footer}
				<div class="qm-popover-footer">
					{@render footer()}
				</div>
			{/if}
		</div>
	</Portal>
{/if}

<style>
	:global(.qm-popover) {
		position: fixed;
		width: max-content;
		min-width: 12rem;
		background: var(--qm-surface-elevated);
		color: var(--qm-foreground);
		border: 1px solid var(--qm-border);
		border-radius: var(--qm-radius);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
	}
	:global(.qm-popover .qm-popover-header) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1rem 0.5rem;
		gap: 0.5rem;
	}
	:global(.qm-popover .qm-popover-title) {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
	}
	:global(.qm-popover .qm-popover-content) {
		padding: 0.5rem 1rem 0.875rem;
	}
	:global(.qm-popover .qm-popover-content.qm-no-pad) {
		padding: 0;
	}
	:global(.qm-popover .qm-popover-footer) {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding: 0.625rem 1rem 0.875rem;
		border-top: 1px solid var(--qm-border);
	}
</style>
