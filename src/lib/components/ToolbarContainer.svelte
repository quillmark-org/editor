<script lang="ts">
	/**
	 * Shared container for editor toolbars to ensure consistent height and styling.
	 */
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div
	class="toolbar-fixed-height layout-border-b flex h-[51px] items-center justify-between gap-1 border-b border-border bg-surface-elevated px-2"
>
	{@render children()}
</div>

<style>
	.toolbar-fixed-height {
		height: 48px !important;
		min-height: 48px !important;
		max-height: 48px !important;
		flex-shrink: 0 !important;
	}
</style>
