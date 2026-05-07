<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import { Loader2 } from 'lucide-svelte';

	type ButtonProps = {
		variant?: 'default' | 'ghost' | 'outline' | 'destructive' | 'success';
		size?: 'default' | 'sm' | 'lg' | 'icon';
		class?: string;
		children?: import('svelte').Snippet;
		onclick?: (e: MouseEvent) => void;
		disabled?: boolean;
		loading?: boolean;
		type?: 'button' | 'submit' | 'reset';
		title?: string;
		'aria-label'?: string;
	};

	let {
		variant = 'default',
		size = 'default',
		class: className,
		children,
		onclick,
		disabled = false,
		loading = false,
		type = 'button',
		title,
		'aria-label': ariaLabel,
		...restProps
	}: ButtonProps = $props();

	const variants = {
		default: 'bg-primary text-primary-foreground hover:bg-primary/90',
		ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
		outline: 'border border-border hover:bg-accent hover:text-accent-foreground',
		destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
		success: 'bg-success text-success-foreground hover:bg-success/90'
	};

	const sizes = {
		default: 'h-10 px-4 py-2',
		sm: 'h-8 rounded-md px-3 text-sm',
		lg: 'h-11 rounded-md px-8',
		icon: 'h-8 w-8 p-0'
	};
</script>

<button
	{type}
	disabled={disabled || loading}
	{onclick}
	{title}
	aria-label={ariaLabel}
	class={cn(
		'inline-flex cursor-pointer items-center justify-center rounded-sm text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
		variants[variant],
		sizes[size],
		className
	)}
	{...restProps}
>
	{#if loading}
		<Loader2 class="mr-2 h-4 w-4 animate-spin" />
	{/if}
	{#if children}
		{@render children()}
	{/if}
</button>
