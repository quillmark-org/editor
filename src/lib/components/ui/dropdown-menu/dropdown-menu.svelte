<script lang="ts">
	import BasePopover from '$lib/components/ui/base-popover.svelte';
	import { cn } from '$lib/utils/cn';
	import type { Snippet } from 'svelte';

	interface Props {
		open?: boolean;
		trigger: Snippet;
		children: Snippet;
		align?: 'start' | 'center' | 'end';
		side?: 'top' | 'right' | 'bottom' | 'left';
		sideOffset?: number;
		class?: string;
		contentClass?: string;
	}

	let {
		open = $bindable(false),
		trigger,
		children,
		align = 'end',
		side = 'bottom',
		sideOffset = 4,
		class: className,
		contentClass
	}: Props = $props();
</script>

<BasePopover
	bind:open
	{trigger}
	{align}
	{side}
	{sideOffset}
	class={cn('p-1 min-w-[8rem]', className)}
	closeOnOutsideClick={true}
	disablePadding={true}
>
	{#snippet content()}
		<div
			class={cn('flex flex-col', contentClass)}
			role="menu"
		>
			{@render children()}
		</div>
	{/snippet}
</BasePopover>
