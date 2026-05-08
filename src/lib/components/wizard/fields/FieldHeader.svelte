<script lang="ts">
	import { Info } from 'lucide-svelte';

	interface Props {
		label: string;
		required?: boolean;
		description?: string;
		error?: boolean;
		onLabelClick?: () => void;
		children?: import('svelte').Snippet;
	}

	let {
		label,
		required = false,
		description,
		error = false,
		onLabelClick,
		children
	}: Props = $props();
</script>

<div class="flex items-center justify-between gap-2">
	<div class="flex min-w-0 items-center gap-2">
		<button
			type="button"
			class="qm-field-label min-w-0 inline-flex items-center gap-1 truncate text-left text-xs {error
				? 'text-destructive'
				: 'font-semibold'} cursor-pointer hover:text-foreground/80"
			data-hint={description || null}
			onclick={onLabelClick}
		>
			<span class="truncate">{label}</span>
			{#if required}<span class="text-destructive flex-shrink-0">*</span>{/if}
			{#if description}
				<Info
					class="h-3 w-3 flex-shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
				/>
			{/if}
		</button>
	</div>
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.qm-field-label {
		position: relative;
	}
	.qm-field-label[data-hint]:hover::after,
	.qm-field-label[data-hint]:focus-visible::after {
		content: attr(data-hint);
		position: absolute;
		bottom: calc(100% + 6px);
		left: 0;
		max-width: 18rem;
		padding: 0.375rem 0.625rem;
		font-size: 0.8125rem;
		font-weight: 400;
		line-height: 1.4;
		color: var(--qm-foreground);
		background: var(--qm-surface-elevated);
		border: 1px solid var(--qm-border);
		border-radius: var(--qm-radius-sm);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
		white-space: normal;
		text-align: left;
		pointer-events: none;
		z-index: var(--qm-z-popover);
		animation: qm-field-hint-in 0.12s ease-out;
	}
	@keyframes qm-field-hint-in {
		from {
			opacity: 0;
			transform: translateY(2px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
