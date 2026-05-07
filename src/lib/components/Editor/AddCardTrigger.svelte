<script lang="ts">
	import { Plus } from 'lucide-svelte';

	interface Props {
		/** Callback when the trigger is clicked */
		onAdd: () => void;
		/** Whether this is the final trigger, showing a persistent dim label */
		isLast?: boolean;
	}

	let { onAdd, isLast = false }: Props = $props();
</script>

<button
	onclick={(e) => {
		e.stopPropagation();
		e.currentTarget.blur();
		onAdd();
	}}
	class="add-card-trigger"
	class:is-last={isLast}
	aria-label="Add new card"
>
	{#if isLast}
		<Plus class="size-3" />
		<span>Add Card</span>
	{/if}
</button>

<style>
	.add-card-trigger {
		display: flex;
		height: 1rem;
		width: 100%;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		line-height: 1rem;
		font-weight: 500;
		color: var(--color-muted-foreground);
		opacity: 0;
		/* Reverse (unhover) transition: drops instantly and tails off */
		transition: all 500ms cubic-bezier(0.4, 0.0, 0.2, 1);
	}

	.add-card-trigger.is-last {
		height: 1.5rem;
		opacity: 0.35;
	}

	.add-card-trigger:hover {
		opacity: 1;
		background: color-mix(in srgb, var(--color-muted-foreground) 15%, transparent);
		box-shadow: 0 0 1px 1px color-mix(in srgb, var(--color-muted-foreground) 10%, transparent);
	}


	/* On touch devices (no hover), show at reduced opacity; full opacity on active/focus */
	@media (hover: none) {
		.add-card-trigger {
			opacity: 0.3 !important;
		}
		.add-card-trigger:active,
		.add-card-trigger:focus {
			opacity: 1 !important;
		}
	}
</style>
