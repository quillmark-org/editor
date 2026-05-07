<script lang="ts">
	import { Download, ChevronDown, Loader2 } from 'lucide-svelte';
	import { DownloadPdfIconSvg, DownloadMarkdownIconSvg } from '$lib/icons/custom-icons';
	import Button from './button.svelte';
	import { DropdownMenu, DropdownItem } from '$lib/components/ui/dropdown-menu';

	type DownloadButtonProps = {
		onDownload: () => void;
		onDownloadMarkdown?: () => void;
		disabled?: boolean;
		isDownloading?: boolean;
		disabledTitle?: string;
		/**
		 * Whether to show label text (responsive: hidden on mobile)
		 * @default true
		 */
		showLabel?: boolean;
	};

	let {
		onDownload,
		onDownloadMarkdown,
		disabled = false,
		isDownloading = false,
		disabledTitle = 'No preview available to download',
		showLabel = true
	}: DownloadButtonProps = $props();

	let dropdownOpen = $state(false);

	function handleDownloadMarkdown() {
		if (onDownloadMarkdown) {
			onDownloadMarkdown();
		}
		dropdownOpen = false;
	}

	function handleDownload() {
		if (!disabled && !isDownloading) {
			onDownload();
		}
	}
</script>

<div class="flex rounded-md border border-border-hover">
	<Button
		variant="ghost"
		size="sm"
		class="h-8 rounded-r-none rounded-l-sm bg-surface text-foreground hover:bg-accent hover:text-foreground"
		onclick={handleDownload}
		disabled={disabled || isDownloading}
		aria-label="Download document as PDF"
		title={disabled ? disabledTitle : 'Download document as PDF'}
	>
		{#if isDownloading}
			<Loader2 class="mr-1 h-4 w-4 animate-spin" />
		{:else}
			<Download class="mr-1 h-4 w-4" />
		{/if}
		{#if showLabel}
			<span class="hidden sm:inline">Download</span>
		{/if}
	</Button>
	{#if onDownloadMarkdown}
		<DropdownMenu
			bind:open={dropdownOpen}
			align="end"
			sideOffset={0}
			class="rounded-md border-border-hover"
		>
			{#snippet trigger()}
				<Button
					variant="ghost"
					size="sm"
					class="h-8 w-6 rounded-l-none rounded-r-sm border-l border-border-hover bg-surface px-0 text-foreground hover:bg-accent hover:text-foreground"
					disabled={disabled || isDownloading}
					aria-label="Download options"
					title="Download options"
				>
					<ChevronDown class="h-3 w-3" />
				</Button>
			{/snippet}

			<DropdownItem onclick={() => { handleDownload(); dropdownOpen = false; }}>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- hardcoded SVG string from $lib/icons/custom-icons -->
				<span class="mr-2 h-4 w-4">{@html DownloadPdfIconSvg}</span>
				PDF
			</DropdownItem>

			<DropdownItem onclick={handleDownloadMarkdown}>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- hardcoded SVG string from $lib/icons/custom-icons -->
				<span class="mr-2 h-4 w-4">{@html DownloadMarkdownIconSvg}</span>
				Markdown
			</DropdownItem>
		</DropdownMenu>
	{/if}
</div>
