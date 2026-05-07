<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { FileX, Home, ArrowLeft } from 'lucide-svelte';
	import Button from '$lib/components/ui/button.svelte';
	import AppHead from '$lib/components/AppHead.svelte';

	const brand = $derived(page.data.config.brand);

	onMount(() => {
		// Apply dark mode setting from localStorage
		const savedDarkMode = localStorage.getItem('dark-mode');
		if (savedDarkMode === null || savedDarkMode === 'true') {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	});
</script>

<AppHead title="Document Not Found" />

<div class="flex h-full flex-col items-center justify-center bg-background px-4">
	<div class="flex max-w-md flex-col items-center text-center">
		<!-- Icon -->
		<div class="mb-6 rounded-full bg-muted p-4">
			<FileX class="h-12 w-12 text-muted-foreground" />
		</div>

		<!-- Title -->
		<h1 class="mb-2 text-2xl font-semibold text-foreground">Document Not Found</h1>

		<!-- Description -->
		<p class="mb-8 text-muted-foreground">
			{#if page.status === 404}
				This document doesn't exist or is no longer available.
			{:else}
				An error occurred while loading the document.
			{/if}
		</p>

		<!-- Actions -->
		<div class="flex flex-col gap-3 sm:flex-row">
			<Button variant="outline" onclick={() => window.history.back()}>
				<ArrowLeft class="mr-2 h-4 w-4" />
				Go Back
			</Button>
			<Button variant="default" onclick={() => (window.location.href = '/')}>
				<Home class="mr-2 h-4 w-4" />
				Go to {brand.displayFull}
			</Button>
		</div>
	</div>

	<!-- Footer -->
	<footer class="absolute bottom-4 text-sm text-muted-foreground">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/" class="hover:text-foreground hover:underline">{brand.displayFull}</a>
		- Create beautiful documents from markdown
	</footer>
</div>
