<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import type { Snippet } from 'svelte';

	interface Props {
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
		class?: string;
		disabled?: boolean;
	}

	let {
		onclick,
		children,
		class: className,
		disabled = false
	}: Props = $props();
</script>

<button
	type="button"
	class={cn(
		'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
		'hover:bg-accent hover:text-accent-foreground',
		'focus:bg-accent focus:text-accent-foreground',
		'disabled:pointer-events-none disabled:opacity-50',
		className
	)}
	{disabled}
	{onclick}
>
	{@render children()}
</button>
