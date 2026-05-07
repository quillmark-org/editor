<script lang="ts">
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
		class: className = '',
		children,
		onclick,
		disabled = false,
		loading = false,
		type = 'button',
		title,
		'aria-label': ariaLabel,
		...restProps
	}: ButtonProps = $props();
</script>

<button
	{type}
	disabled={disabled || loading}
	{onclick}
	{title}
	aria-label={ariaLabel}
	class="qm-btn qm-btn-{variant} qm-btn-{size} {className}"
	{...restProps}
>
	{#if loading}
		<Loader2 class="qm-btn-spinner" size={14} />
	{/if}
	{#if children}
		{@render children()}
	{/if}
</button>

<style>
	.qm-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		border-radius: var(--qm-radius-sm);
		font-size: 0.875rem;
		font-weight: 500;
		white-space: nowrap;
		border: 1px solid transparent;
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			color 0.15s ease,
			border-color 0.15s ease;
		font-family: inherit;
	}

	.qm-btn:focus-visible {
		outline: 2px solid var(--qm-ring);
		outline-offset: 2px;
	}

	.qm-btn:disabled {
		opacity: 0.5;
		pointer-events: none;
	}

	:global(.qm-btn-spinner) {
		animation: qm-spin 1s linear infinite;
	}

	@keyframes qm-spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Variants */
	.qm-btn-default {
		background: var(--qm-primary);
		color: var(--qm-primary-foreground);
	}
	.qm-btn-default:hover {
		background: color-mix(in srgb, var(--qm-primary) 88%, transparent);
	}

	.qm-btn-ghost {
		background: transparent;
		color: var(--qm-foreground);
	}
	.qm-btn-ghost:hover {
		background: var(--qm-accent);
		color: var(--qm-accent-foreground);
	}

	.qm-btn-outline {
		background: transparent;
		color: var(--qm-foreground);
		border-color: var(--qm-border);
	}
	.qm-btn-outline:hover {
		background: var(--qm-accent);
		color: var(--qm-accent-foreground);
	}

	.qm-btn-destructive {
		background: var(--qm-destructive);
		color: var(--qm-destructive-foreground);
	}
	.qm-btn-destructive:hover {
		background: var(--qm-destructive-hover);
	}

	.qm-btn-success {
		background: var(--qm-success);
		color: var(--qm-success-foreground);
	}
	.qm-btn-success:hover {
		background: color-mix(in srgb, var(--qm-success) 88%, transparent);
	}

	/* Sizes */
	.qm-btn-default {
		height: 2.25rem;
		padding: 0 0.875rem;
	}
	.qm-btn-sm {
		height: 1.875rem;
		padding: 0 0.625rem;
		font-size: 0.8125rem;
	}
	.qm-btn-lg {
		height: 2.5rem;
		padding: 0 1.25rem;
		font-size: 0.9375rem;
	}
	.qm-btn-icon {
		height: 1.875rem;
		width: 1.875rem;
		padding: 0;
	}
</style>
