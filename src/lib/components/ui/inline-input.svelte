<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/cn';

	interface Props extends HTMLInputAttributes {
		ref?: HTMLInputElement | null;
	}

	let { class: className, value = $bindable(), ref = $bindable(null), ...rest }: Props = $props();
</script>

<input
	bind:this={ref}
	bind:value
	class={cn(
		'flex h-9 w-full border-b border-border bg-transparent px-0 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...rest}
/>
