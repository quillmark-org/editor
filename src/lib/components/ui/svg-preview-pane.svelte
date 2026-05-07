<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import { extractSvgDimensions, buildSvgSrcdoc } from '$lib/utils/svg';
	import { cn } from '$lib/utils/cn';

	interface Props {
		/** SVG page strings to render */
		pages: string[];
		/** Whether the preview is still loading */
		loading?: boolean;
		/** Additional class for the outer container */
		class?: string;
		/** Gap between pages — Tailwind gap class (e.g. 'gap-3', 'gap-4') */
		gap?: string;
		/** Padding around the page list — Tailwind padding class */
		padding?: string;
	}

	let {
		pages,
		loading = false,
		class: className,
		gap = 'gap-4',
		padding = 'p-4'
	}: Props = $props();
</script>

{#if loading}
	<div class={cn('flex h-full items-center justify-center', className)}>
		<div class="text-center">
			<Loader2 class="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
			<p class="mt-2 text-sm text-muted-foreground">Rendering preview...</p>
		</div>
	</div>
{:else if pages.length > 0}
	<div class={cn('flex flex-col items-center', gap, padding, className)}>
		{#each pages as page, index (index)}
			{@const dims = extractSvgDimensions(page)}
			<div class="w-full max-w-full">
				<iframe
					title="Page {index + 1} preview"
					srcdoc={buildSvgSrcdoc(page)}
					sandbox=""
					class="w-full border-none bg-white shadow-sm"
					style="aspect-ratio: {dims.width} / {dims.height};"
				></iframe>
			</div>
		{/each}
	</div>
{:else}
	<div class={cn('flex h-full items-center justify-center text-sm text-muted-foreground', className)}>
		No preview available
	</div>
{/if}
