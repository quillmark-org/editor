<script lang="ts">
	import { X } from 'lucide-svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Portal from '$lib/components/ui/portal.svelte';
	import { cn } from '$lib/utils/cn';
	import { useDismissible } from '$lib/utils/overlay/use-dismissible';
	import { useFocusTrap } from '$lib/utils/overlay/use-focus-trap';
	import { useZIndex } from '$lib/utils/overlay/use-zindex';
	import { generateUniqueId } from '$lib/utils/unique-id';

	interface DialogProps {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		title?: string;
		description?: string;
		closeOnEscape?: boolean;
		closeOnOutsideClick?: boolean;
		hideCloseButton?: boolean;
		scoped?: boolean;
		/** Stack above other portaled modals so backdrop covers their content (same viewport layer). */
		elevated?: boolean;
		size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'fullscreen' | 'panel';
		class?: string;
		headerClass?: string;
		content: import('svelte').Snippet;
		header?: import('svelte').Snippet;
		footer?: import('svelte').Snippet;
		/** Callback when Cmd/Ctrl+Enter pressed */
		onSubmit?: () => void;
		/** Whether to restore focus to the previously focused element on close */
		restoreFocus?: boolean;
		/** Optional selector for initial focus target inside the dialog */
		initialFocusSelector?: string;
	}

	let {
		open,
		onOpenChange,
		title,
		description,
		closeOnEscape = true,
		closeOnOutsideClick = true,
		hideCloseButton = false,
		scoped = false,
		elevated = false,
		size = 'md',
		class: className,
		headerClass,
		content,
		header,
		footer,
		onSubmit,
		restoreFocus = true,
		initialFocusSelector
	}: DialogProps = $props();

	const sizeClasses: Record<string, string> = {
		sm: 'max-w-sm',
		md: 'max-w-md',
		lg: 'max-w-lg',
		xl: 'max-w-xl',
		full: 'max-w-4xl',
		fullscreen: 'w-full h-full max-w-none',
		panel: 'dialog-panel'
	};

	const isPanel = $derived(size === 'panel');

	const backdropZClass = $derived(
		scoped ? 'z-scoped-backdrop' : elevated ? 'z-modal-elevated-backdrop' : 'z-modal-backdrop'
	);
	const contentZClass = $derived(
		scoped ? 'z-scoped-content' : elevated ? 'z-modal-elevated-content' : 'z-modal-content'
	);

	// Generate unique IDs for ARIA attributes
	const baseId = generateUniqueId();
	const titleId = `dialog-title-${baseId}`;
	const descId = $derived(description ? `dialog-desc-${baseId}` : undefined);

	// Composable hooks - use $derived to reactively capture props
	const dismissible = $derived(
		useDismissible({
			onEscape: closeOnEscape ? () => onOpenChange(false) : undefined,
			onBackdrop: closeOnOutsideClick ? () => onOpenChange(false) : undefined,
			onSubmit
		})
	);

	const focusTrap = $derived(useFocusTrap({ enabled: true, restoreFocus, initialFocusSelector }));

	const zIndex = useZIndex({
		layer: 'dialog',
		onClose: () => onOpenChange(false)
	});

	// Register/unregister with overlay store for coordination
	$effect(() => {
		if (open) {
			return zIndex.registerEffect();
		}
	});

	function handleClose() {
		onOpenChange(false);
	}

	function handleContainerMouseDown(event: MouseEvent) {
		// Don't let empty-container clicks steal focus from interactive children.
		if (event.target === event.currentTarget) {
			event.preventDefault();
		}
	}
</script>

{#if open}
	<Portal disabled={scoped}>
		<!-- Backdrop -->
		<div
			class={cn(
				backdropZClass,
				'inset-0 bg-overlay',
				scoped ? 'absolute' : 'fixed'
			)}
			onclick={dismissible.handleBackdropClick}
			role="presentation"
		></div>

		<!-- Dialog Container -->
		<div
			class={cn(
				contentZClass,
				'select-none bg-surface-elevated shadow-lg focus:outline-none',
				size === 'fullscreen'
					? 'absolute inset-0 flex flex-col'
					: cn(
							'w-full rounded-lg border border-border',
							isPanel ? 'flex flex-col' : 'p-6',
							scoped
								? 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
								: 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
						),
				sizeClasses[size],
				className
			)}
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
			aria-describedby={descId}
			tabindex="-1"
			onclick={(e: MouseEvent) => e.stopPropagation()}
			onmousedown={handleContainerMouseDown}
			onkeydown={dismissible.handleKeyDown}
			use:focusTrap.focusTrapAction
		>
				<!-- Header -->
				{#if header || title || !hideCloseButton}
					<div
						class={cn(
							'flex shrink-0 items-center justify-between',
						size === 'fullscreen' ? 'p-3 pb-0' : isPanel ? 'border-b border-border px-6 py-3' : 'mb-3',
						headerClass
					)}
				>
					{#if header}
						{@render header()}
					{:else}
						<h2 id={titleId} class="text-lg font-semibold text-foreground">{title}</h2>
					{/if}

						{#if !hideCloseButton}
							<Button
								variant="ghost"
								size="icon"
								class="h-8 w-8"
							onclick={handleClose}
							aria-label="Close dialog"
							>
								<X class="h-4 w-4 text-foreground" />
							</Button>
						{/if}
				</div>
			{/if}

			<!-- Description (optional) -->
			{#if description}
				<p
					id={descId}
					class={cn('text-sm text-muted-foreground', size === 'fullscreen' ? 'px-4 pb-2' : isPanel ? 'px-6 pb-2' : 'mb-4')}
				>
					{description}
				</p>
			{/if}

			<!-- Content -->
			<div
				class={cn('dialog-content', size === 'fullscreen' ? 'flex-1 overflow-auto px-4 pb-4' : isPanel ? 'flex-1 overflow-hidden' : '')}
			>
				{@render content()}
			</div>

			<!-- Footer (optional) -->
			{#if footer}
				<div
					class={cn('flex shrink-0 justify-end gap-2', size === 'fullscreen' ? 'px-4 pt-3 pb-4' : isPanel ? 'border-t border-border px-6 py-4' : 'mt-6')}
				>
					{@render footer()}
				</div>
			{/if}
		</div>
	</Portal>
{/if}

<style>
	:global(.dialog-panel) {
		width: 90vw;
		max-width: 1200px;
		height: 85vh;
		max-height: 85vh;
	}
</style>
