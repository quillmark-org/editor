<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronUp, ChevronDown, Trash2 } from 'lucide-svelte';
	import Button from '$lib/ui/button.svelte';
	import InlineEditableTitle from '$lib/ui/inline-editable-title.svelte';

	interface Props {
		/** Label displayed in block header */
		label: string;
		/** Block styling variant */
		variant?: 'primary' | 'card';
		/** Content slot */
		children: Snippet;
		/** Whether this block is currently active (focused) */
		isActive?: boolean;
		/** Whether to hide the label entirely */
		hideLabel?: boolean;
		/** Callback when the label is edited (makes label editable when provided) */
		onLabelChange?: (newName: string) => void;
		
		// Card controls
		onMoveUp?: () => void;
		onMoveDown?: () => void;
		onDelete?: () => void;
		isFirst?: boolean;
		isLast?: boolean;
		/** Optional click handler for the block itself */
		onclick?: (e: MouseEvent) => void;
	}

	let { 
		label, 
		variant = 'primary', 
		children,
		isActive = false,
		hideLabel = false,
		onLabelChange,
		onMoveUp,
		onMoveDown,
		onDelete,
		isFirst = false,
		isLast = false,
		onclick
	}: Props = $props();

	let isEditingLabel = $state(false);

	// Capture-phase click handler - fires BEFORE any child's stopPropagation
	function captureClick(node: HTMLElement) {
		function handleCapture(e: MouseEvent) {
			// Call onclick during capture phase (before bubbling)
			onclick?.(e);
		}
		node.addEventListener('click', handleCapture, true); // true = capture phase
		return {
			destroy() {
				node.removeEventListener('click', handleCapture, true);
			}
		};
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="editor-block editor-block--{variant} group bg-surface transition-all duration-200 !outline-none !ring-0 {isActive ? 'is-active' : ''}"
	use:captureClick
	role={onclick ? "button" : undefined}
	tabindex={onclick ? 0 : undefined}
	onkeydown={onclick ? (e) => e.key === 'Enter' && onclick(e as unknown as MouseEvent) : undefined}
>
	{#if !hideLabel}
	<header class="editor-block__header flex items-center justify-between">
		{#if onLabelChange}
			<span
				class="-mx-2 cursor-text overflow-hidden rounded-sm transition-colors {isEditingLabel ? 'bg-background' : 'hover:bg-background'}"
				role="button"
				tabindex={isEditingLabel ? -1 : 0}
				onclick={() => !isEditingLabel && (isEditingLabel = true)}
				onkeydown={(e) => !isEditingLabel && e.key === 'Enter' && (isEditingLabel = true)}
			>
				<InlineEditableTitle
					value={label}
					bind:isEditing={isEditingLabel}
					onCommit={(newName) => onLabelChange?.(newName)}
					defaultValue={label}
					class="min-w-16 max-w-full"
					textClass="px-2 py-1 text-sm font-medium"
					inputClass="px-2 py-1 text-sm font-medium text-foreground/80"
					ariaLabel="Edit card title"
				/>
			</span>
		{:else}
			<span class="text-sm font-medium text-foreground/80">{label}</span>
		{/if}
		
		{#if variant === 'card'}
		<div class="flex items-center gap-1">
			<!-- Move buttons: hover-revealed -->
			<div class="flex items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100" class:opacity-100={isActive}>
				{#if onMoveUp}
					<Button 
						variant="ghost" 
						size="icon" 
						class="h-6 w-6 text-muted-foreground hover:text-foreground" 
						disabled={isFirst}
						onclick={(e) => { e.stopPropagation(); onMoveUp(); }}
						title="Move Up"
					>
						<ChevronUp class="h-3.5 w-3.5" />
					</Button>
				{/if}
				
				{#if onMoveDown}
					<Button 
						variant="ghost" 
						size="icon" 
						class="h-6 w-6 text-muted-foreground hover:text-foreground" 
						disabled={isLast}
						onclick={(e) => { e.stopPropagation(); onMoveDown(); }}
						title="Move Down"
					>
						<ChevronDown class="h-3.5 w-3.5" />
					</Button>
				{/if}
			</div>
			
			<!-- Delete button: always visible, red -->
			{#if onDelete}
				<Button 
					variant="ghost" 
					size="icon" 
					class="h-7 w-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10" 
					onclick={(e) => { e.stopPropagation(); onDelete(); }}
					title="Delete Card"
				>
					<Trash2 class="h-4 w-4" />
				</Button>
			{/if}
		</div>
	{/if}
	</header>
	{/if}
	<div class="editor-block__content" class:editor-block__content--no-header={hideLabel}>
		{@render children()}
	</div>
</div>

<style>
	.editor-block {
		border-radius: .5rem; /* rounded-2xl for friendlier feel */
		/* Use clip for content but allow decorations (ring, outline) to show */
		overflow: clip;
		
		/* Subtle shadow only - no hard border */
		border: none;
		box-shadow: 0 2px 8px -2px rgb(0 0 0 / 0.1), 0 1px 3px -1px rgb(0 0 0 / 0.06);
	}

	/* Card focus state for "lift" effect - use .is-active for JS-driven state */
	.editor-block:focus-within,
	.editor-block.is-active {
		box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05);
	}

	.editor-block:focus-within,
	.editor-block.is-active {
		outline: none;
	}

	.editor-block--card,
	.editor-block--primary {
		border: 1px solid color-mix(in srgb, var(--qm-border) 50%, transparent);
	}

	.editor-block__header {
		padding: 0.5rem 0.5rem 0.5rem 1rem;
		border-bottom: none; /* Seamless header */
		background: transparent;
	}

	.editor-block__content {
		padding: 0 0.5rem 0.5rem;
	}

	.editor-block__content--no-header {
		padding-top: .5rem;
	}
</style>
