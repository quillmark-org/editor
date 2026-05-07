<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowLeft, Copy, Check, FileText, Plus, ExternalLink } from 'lucide-svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Preview from '$lib/components/Preview/Preview.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import DownloadButton from '$lib/components/ui/download-button.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { quillmarkService, resultToBlob, resultToSVGPages } from '$lib/services/quillmark';
	import type { PublicDocument } from '$lib/services/documents/types';
	import BrandTitle from '$lib/components/BrandTitle.svelte';

	interface Props {
		document: PublicDocument;
		primaryAction: { label: string; onclick: () => void | Promise<void> };
		showCopyLink?: boolean;
	}

	let { document, primaryAction, showCopyLink = true }: Props = $props();

	let isPrimaryActionRunning = $state(false);

	async function handlePrimaryAction() {
		if (isPrimaryActionRunning) return;
		isPrimaryActionRunning = true;
		try {
			await primaryAction.onclick();
		} finally {
			isPrimaryActionRunning = false;
		}
	}

	const brand = $derived(page.data.config.brand);

	let copied = $state(false);
	let hasSuccessfulPreview = $state(false);
	let isDownloading = $state(false);

	// Derive values from document
	let documentName = $derived(document.name);
	let ownerDisplayName = $derived(document.owner_display_name);
	let documentContent = $derived(document.content);

	async function handleCopyLink() {
		try {
			await navigator.clipboard.writeText(window.location.href);
			copied = true;
			toastStore.success('Link copied to clipboard');

			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch {
			toastStore.error('Failed to copy link');
		}
	}

	async function handleDownload() {
		if (!hasSuccessfulPreview || isDownloading) return;

		isDownloading = true;
		try {
			// Render using Quillmark service (auto-detects backend and format)
			const result = await quillmarkService.render(documentContent, 'pdf');

			// Convert to blob based on format
			let blob: Blob;
			let extension: string;

			if (result.outputFormat === 'pdf') {
				blob = resultToBlob(result);
				extension = '.pdf';
			} else if (result.outputFormat === 'svg') {
				// For SVG, download the first page
				const svgPages = resultToSVGPages(result);
				blob = new Blob([svgPages[0]], { type: 'image/svg+xml' });
				extension = '.svg';
			} else {
				// Fallback to markdown
				blob = new Blob([documentContent], { type: 'text/markdown' });
				extension = '.md';
			}

			// Create filename with proper extension
			const baseName = documentName.replace(/\.(md|markdown)$/i, '');
			const filename = baseName + extension;

			// Download
			const url = URL.createObjectURL(blob);
			const a = window.document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error('Download failed:', error);
			toastStore.error('Failed to download document');
		} finally {
			isDownloading = false;
		}
	}

	function handlePreviewStatusChange(status: boolean) {
		hasSuccessfulPreview = status;
	}

	function handleDownloadMarkdown() {
		if (!documentContent) return;

		const baseName = documentName.replace(/\.(md|markdown)$/i, '');
		const filename = baseName + '.md';

		const blob = new Blob([documentContent], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = window.document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	onMount(() => {
		// Apply dark mode setting from localStorage
		const savedDarkMode = localStorage.getItem('dark-mode');
		if (savedDarkMode === null || savedDarkMode === 'true') {
			window.document.documentElement.classList.add('dark');
		} else {
			window.document.documentElement.classList.remove('dark');
		}
	});
</script>

<div class="flex h-full flex-col bg-background">
	<!-- Header -->
	<header
		class="layout-border-b flex items-center justify-between border-b border-border bg-background px-4"
		style="height: var(--top-menu-height);"
	>
		<div class="flex items-center gap-3">
			<a
				href={resolve("/")}
				class="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
				title="Go to {brand.full}"
			>
				<ArrowLeft class="h-4 w-4" />
				<span class="hidden font-mono sm:inline"><BrandTitle /></span>
			</a>

			<div class="h-4 w-px bg-border"></div>

			<div class="flex items-center gap-2">
				<FileText class="h-4 w-4 text-muted-foreground" />
				<span class="text-foreground">{documentName}</span>
				<span class="text-xs text-muted-foreground">by {ownerDisplayName}</span>
			</div>
		</div>

		<div class="flex items-center gap-2">
			{#if showCopyLink}
				<Button
					variant="ghost"
					size="sm"
					class="h-8 text-foreground/80 hover:bg-accent hover:text-foreground"
					onclick={handleCopyLink}
					title="Copy link to clipboard"
				>
					{#if copied}
						<Check class="mr-1 h-4 w-4 text-success" />
					{:else}
						<Copy class="mr-1 h-4 w-4" />
					{/if}
					<span class="hidden sm:inline">Copy Link</span>
				</Button>
			{/if}

			<DownloadButton
				onDownload={handleDownload}
				onDownloadMarkdown={handleDownloadMarkdown}
				disabled={!hasSuccessfulPreview}
				{isDownloading}
				showLabel={true}
			/>

			<Button
				variant="default"
				size="sm"
				class="h-8"
				onclick={handlePrimaryAction}
				disabled={isPrimaryActionRunning}
				title={primaryAction?.label ?? 'Save Copy'}
			>
				<Plus class="mr-1 h-4 w-4" />
				<span class="hidden sm:inline">{primaryAction?.label ?? 'Save Copy'}</span>
			</Button>
		</div>
	</header>

	<!-- Preview Content -->
	<main class="flex-1 overflow-auto">
		<div class="mx-auto h-full" style="max-width: 800px;">
			<Preview markdown={documentContent} onPreviewStatusChange={handlePreviewStatusChange} />
		</div>
	</main>

	<!-- Footer -->
	<footer
		class="layout-border-t flex items-center justify-center border-t border-border bg-surface-elevated px-4 py-2"
	>
		<a
			href={resolve("/")}
			class="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<span>Create your own documents with</span>
			<span class="font-mono text-foreground"><BrandTitle /></span>
			<ExternalLink class="h-3 w-3" />
		</a>
	</footer>
</div>
