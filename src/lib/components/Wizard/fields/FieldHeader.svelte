<script lang="ts">
	import Tooltip from '$lib/components/ui/tooltip.svelte';
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
		{#if description}
			<Tooltip content={description} delay={300}>
				<button
					type="button"
					class="min-w-0 inline-flex items-center gap-1 truncate text-left text-xs {error ? 'text-destructive' : 'font-semibold'} cursor-pointer hover:text-foreground/80"
					onclick={onLabelClick}
				>
					<span class="truncate">{label}</span>
					{#if required}<span class="text-destructive flex-shrink-0">*</span>{/if}
					<Info class="h-3 w-3 flex-shrink-0 text-muted-foreground/50 hover:text-muted-foreground" />
				</button>
			</Tooltip>
		{:else}
			<button
				type="button"
				class="min-w-0 truncate text-left text-xs {error ? 'text-destructive' : 'font-semibold'} cursor-pointer hover:text-foreground/80"
				onclick={onLabelClick}
			>
				{label}
				{#if required}<span class="text-destructive">*</span>{/if}
			</button>
		{/if}
	</div>
	{#if children}
		{@render children()}
	{/if}
</div>
