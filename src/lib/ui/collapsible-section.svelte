<script lang="ts">
	import { ChevronRight } from 'lucide-svelte';
	import { slide } from 'svelte/transition';

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
	}

	let {
		label,
		expanded,
		onToggle,
		children,
		id,
		size = 'sm',
		class: className = '',
		buttonClass = '',
		labelClass = '',
		contentClass = '',
		transitionDuration = 180
	}: Props = $props();
</script>

<div {id} class="qm-collapsible {className}" class:qm-collapsible-expanded={expanded}>
	<button
		type="button"
		class="qm-collapsible-trigger qm-collapsible-trigger-{size} {buttonClass}"
		class:qm-collapsible-trigger-expanded={expanded}
		onclick={onToggle}
		aria-expanded={expanded}
	>
		<ChevronRight class="qm-collapsible-chevron" size={size === 'md' ? 14 : 12} />
		<span class="qm-collapsible-label qm-collapsible-label-{size} {labelClass}">{label}</span>
	</button>

	{#if expanded}
		<div class="qm-collapsible-content {contentClass}" transition:slide={{ duration: transitionDuration }}>
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.qm-collapsible {
		border-left: 2px solid transparent;
		transition: border-color 0.18s ease;
	}
	.qm-collapsible-expanded {
		border-left-color: var(--qm-divider-accent);
	}

	.qm-collapsible-trigger {
		display: flex;
		width: 100%;
		align-items: center;
		text-align: left;
		background: none;
		border: none;
		padding: 0.375rem 0;
		cursor: pointer;
		color: var(--qm-muted-foreground);
		font-family: inherit;
		transition: color 0.15s ease;
	}
	.qm-collapsible-trigger:hover {
		color: var(--qm-foreground);
	}
	.qm-collapsible-trigger-expanded {
		color: var(--qm-foreground);
	}

	.qm-collapsible-trigger-sm {
		gap: 0.25rem;
		padding: 0.375rem 0;
	}
	.qm-collapsible-trigger-md {
		gap: 0.375rem;
		padding: 0.25rem 0;
	}

	:global(.qm-collapsible-chevron) {
		flex-shrink: 0;
		transition: transform 0.18s ease;
	}
	.qm-collapsible-trigger-expanded :global(.qm-collapsible-chevron) {
		transform: rotate(90deg);
	}

	.qm-collapsible-label {
		font-weight: 500;
	}
	.qm-collapsible-label-sm {
		font-size: 0.75rem;
	}
	.qm-collapsible-label-md {
		font-size: 0.875rem;
	}
</style>
