<script lang="ts">
	import { Loader2, Star } from 'lucide-svelte';
	import { cn } from '$lib/utils/cn';
	import type { LibraryTemplateListItem } from '$lib/services/templates/library-client';

	export type TemplateCardSectionKey = 'search' | 'recents' | 'official' | 'popular';

	interface TemplateCardProps {
		template: LibraryTemplateListItem;
		section: TemplateCardSectionKey;
		cardKey: string;
		isSelected: boolean;
		thumbnailUrl?: string;
		isThumbnailLoading: boolean;
		isStarred: boolean;
		onSelect: () => void;
		onDoubleClick: () => void;
		onToggleStar: () => void;
		onHoverStart?: () => void;
		onHoverEnd?: () => void;
	}

	let {
		template,
		section,
		cardKey,
		isSelected,
		thumbnailUrl,
		isThumbnailLoading,
		isStarred,
		onSelect,
		onDoubleClick,
		onToggleStar,
		onHoverStart,
		onHoverEnd
	}: TemplateCardProps = $props();

	function handleStarClick(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		onToggleStar();
	}

	function handleStarKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		event.stopPropagation();
		onToggleStar();
	}

	function handleStarDoubleClick(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
	}
</script>

<button
	class={cn('template-card', isSelected && 'template-card-selected')}
	type="button"
	data-section={section}
	data-card-key={cardKey}
	data-autofocus={isSelected ? '' : undefined}
	onclick={onSelect}
	ondblclick={onDoubleClick}
	onmouseenter={onHoverStart}
	onmouseleave={onHoverEnd}
	onfocus={onHoverStart}
	onblur={onHoverEnd}
>
	<div class="template-thumb-stack">
		{#if thumbnailUrl}
			<img src={thumbnailUrl} alt={template.title} class="template-thumb" />
		{:else}
			<div class="template-thumb-placeholder">
				{#if isThumbnailLoading}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<span>Preview</span>
				{/if}
			</div>
		{/if}
		<div
			class={cn(
				'template-star-badge',
				isStarred && 'template-star-badge-starred',
				template.is_official && 'template-star-badge-official'
			)}
			role="button"
			tabindex="0"
			aria-pressed={isStarred}
			onclick={handleStarClick}
			ondblclick={handleStarDoubleClick}
			onkeydown={handleStarKeydown}
		>
			<Star class={cn('h-3 w-3', isStarred && 'fill-yellow-400 text-yellow-400')} />
			{template.star_count}
		</div>
	</div>
	<div class="template-card-title">
		<span class="template-card-title-text" title={template.title}>{template.title}</span>
	</div>
</button>

<style>
	.template-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: left;
		padding: 0.375rem;
		width: 100%;
		height: 100%;
		min-width: 0;
	}

	/* Selection and keyboard focus stay in sync — avoid a second focus ring. */
	.template-card:focus,
	.template-card:focus-visible {
		outline: none;
	}

	.template-card:hover:not(.template-card-selected) .template-card-title-text {
		background: color-mix(in oklab, var(--color-muted) 50%, var(--color-background));
		border-color: color-mix(in oklab, var(--color-border) 100%, transparent);
	}

	.template-card-selected .template-thumb {
		filter: drop-shadow(0 0 1px color-mix(in oklab, var(--color-foreground) 25%, transparent))
		        drop-shadow(0 6px 16px color-mix(in oklab, var(--color-foreground) 18%, transparent));
		transform: scale(1.03);
	}

	.template-card-selected .template-card-title-text {
		background-color: var(--color-primary);
		color: var(--color-primary-foreground);
		border-color: transparent;
		transform: scale(1.03);
	}

	.template-card-title {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		max-width: 100%;
		padding-top: 0.625rem;
	}

	.template-card-title-text {
		display: block;
		width: 100%;
		max-width: 100%;
		font-size: 0.75rem;
		font-weight: 500;
		line-height: normal;
		color: var(--color-foreground);
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding: 0.2rem 0.6rem;
		border-radius: 9999px;
		border: 1px solid color-mix(in oklab, var(--color-border) 60%, transparent);
		background-color: transparent;
		transition: all 150ms ease-out;
	}

	.template-thumb-stack {
		--thumb-max-height: 140px;
		display: inline-grid;
		max-width: 100%;
		min-width: 0;
		margin-block: auto;
	}

	.template-thumb,
	.template-thumb-placeholder {
		grid-area: 1 / 1;
		box-sizing: border-box;
		border: 1px solid color-mix(in oklab, var(--color-border) 60%, transparent);
		border-radius: 0.375rem;
	}

	.template-thumb {
		display: block;
		max-width: 100%;
		max-height: var(--thumb-max-height);
		min-width: 0;
		object-fit: contain;
		filter: drop-shadow(0 0 1px color-mix(in oklab, var(--color-foreground) 20%, transparent))
		        drop-shadow(0 2px 6px color-mix(in oklab, var(--color-foreground) 10%, transparent));
		transition: filter 150ms ease-out, transform 150ms ease-out;
	}

	.template-thumb-placeholder {
		height: var(--thumb-max-height);
		min-width: 7.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		color: var(--color-muted-foreground);
		background: var(--color-muted);
		transition: transform 150ms ease-out;
	}

	.template-star-badge {
		grid-area: 1 / 1;
		align-self: start;
		justify-self: end;
		z-index: 1;
		margin: 0.3125rem 0.3125rem 0 0;
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.1rem 0.3rem;
		border-radius: 9999px;
		font-size: 0.6875rem;
		background: color-mix(in oklab, var(--color-muted) 36%, var(--color-background));
		color: color-mix(in oklab, var(--color-foreground) 84%, var(--color-muted-foreground));
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-foreground) 10%, transparent);
		cursor: pointer;
		transition: background-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
	}

	.template-star-badge:hover {
		background: color-mix(in oklab, var(--color-muted) 52%, var(--color-background));
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-foreground) 14%, transparent);
	}

	.template-star-badge:focus-visible {
		outline: 2px solid color-mix(in oklab, var(--color-primary) 45%, transparent);
		outline-offset: 1px;
	}

	.template-star-badge-starred {
		color: color-mix(in oklab, var(--color-yellow-400, #facc15) 88%, var(--color-foreground));
	}

	.template-star-badge-official {
		background: color-mix(in oklab, var(--color-blue-500, #3b82f6) 12%, var(--color-background));
		color: color-mix(in oklab, var(--color-blue-500, #3b82f6) 58%, var(--color-foreground));
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-blue-500, #3b82f6) 18%, transparent);
	}

	.template-star-badge-official:hover {
		background: color-mix(in oklab, var(--color-blue-500, #3b82f6) 18%, var(--color-background));
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-blue-500, #3b82f6) 25%, transparent);
	}

	@media (max-width: 767px) {
		.template-card {
			width: 100%;
			gap: 0.375rem;
		}

		.template-thumb-stack {
			--thumb-max-height: 110px;
		}

		.template-star-badge {
			min-height: 1.5rem;
			padding-inline: 0.4rem;
			font-size: 0.75rem;
		}

		.template-card-title-text {
			font-size: 0.72rem;
			padding: 0.15rem 0.5rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.template-thumb,
		.template-thumb-placeholder {
			transition: none;
		}

		.template-card:hover:not(.template-card-selected) .template-thumb,
		.template-card:hover:not(.template-card-selected) .template-thumb-placeholder {
			transform: none;
		}

		.template-card-selected .template-thumb,
		.template-card-selected .template-card-title-text {
			transform: none;
		}
	}
</style>
