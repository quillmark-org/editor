<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils/cn';

	interface Props {
		position?: 'top' | 'bottom';
	}

	let { position = 'top' }: Props = $props();

	const config = $derived(page.data.config.classification);
	const toneClass = $derived(`classification-${config.bannerTone}`);
</script>

{#if config.showBanner}
	<div
		class={cn(
			'classification-banner z-banner flex h-4 w-full items-center justify-center text-xs tracking-wide font-medium',
			toneClass
		)}
		class:banner-top={position === 'top'}
		class:banner-bottom={position === 'bottom'}
		role="banner"
		aria-label="Classification: {config.label}"
	>
		{config.label}
	</div>
{/if}

<style>
	@media print {
		.classification-banner {
			position: fixed;
			left: 0;
			right: 0;
			z-index: 9999;
			-webkit-print-color-adjust: exact;
			print-color-adjust: exact;
		}

		.banner-top {
			top: 0;
		}

		.banner-bottom {
			bottom: 0;
		}
	}

	.classification-banner {
		color: var(--classification-foreground);
		background-color: var(--classification-background);
	}

	.classification-banner.classification-unclassified {
		--classification-background: var(--color-classification-unclassified);
		--classification-foreground: var(--color-classification-unclassified-foreground);
	}

	.classification-banner.classification-cui {
		--classification-background: var(--color-classification-cui);
		--classification-foreground: var(--color-classification-cui-foreground);
	}
</style>
