<script lang="ts">
	import { ChevronRight } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import { cn } from '$lib/utils/cn';

	interface Props {
		label: string;
		expanded: boolean;
		onToggle: () => void;
		children: import('svelte').Snippet;
		id?: string;
		size?: 'sm' | 'md';
		class?: string;
		buttonClass?: string;
		labelClass?: string;
		contentClass?: string;
		transitionDuration?: number;
		showExpandedHorizontalBorders?: boolean;
	}

	let {
		label,
		expanded,
		onToggle,
		children,
		id,
		size = 'sm',
		class: className,
		buttonClass,
		labelClass,
		contentClass,
		transitionDuration = 200,
		showExpandedHorizontalBorders = false
	}: Props = $props();
</script>

<div
	{id}
	class={cn(
		'transition-all duration-200 divider-border-l border-transparent',
		showExpandedHorizontalBorders && 'border-y border-y-transparent',
		expanded && 'border-divider-accent',
		expanded && showExpandedHorizontalBorders && 'border-y-border',
		className
	)}
>
	<button
		type="button"
		class={cn(
			'flex w-full items-center text-left transition-all duration-150 group/header',
			size === 'md' ? 'gap-1.5 py-1' : 'gap-1 py-1.5',
			buttonClass
		)}
		onclick={onToggle}
		aria-expanded={expanded}
	>
		<ChevronRight
			class={cn(
				'flex-shrink-0 transition-transform duration-200 ease-out',
				size === 'md' ? 'h-4 w-4' : 'h-3 w-3',
				expanded
					? 'rotate-90 text-primary'
					: 'text-muted-foreground group-hover/header:text-primary'
			)}
		/>
		<span
			class={cn(
				'font-medium transition-colors duration-150',
				size === 'md' ? 'text-sm' : 'text-xs',
				expanded
					? 'text-foreground'
					: 'text-muted-foreground group-hover/header:text-foreground',
				labelClass
			)}
		>
			{label}
		</span>
	</button>

	{#if expanded}
		<div class={contentClass} transition:slide={{ duration: transitionDuration }}>
			{@render children()}
		</div>
	{/if}
</div>
