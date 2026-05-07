<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/ui/button.svelte';
	import BrandTitle from '$lib/components/BrandTitle.svelte';
	import { loginClient } from '$lib/services/auth';
	import type { AuthProviderConfig } from '$lib/services/auth/types';
	import { getErrorMessage } from '$lib/errors';
	import { getProviderIcon } from '$lib/icons/custom-icons';
	import { onMount } from 'svelte';
	
	const providers = $derived<AuthProviderConfig[]>(page.data.providers || []);
	const brand = $derived(page.data.config.brand);
	
	// State management
	let loading = $state(false);
	let error = $state('');
	
	// Check for error/callback params from URL
	onMount(() => {
		const urlError = page.url.searchParams.get('error');
		if (urlError) {
			error = 'Authentication failed. Please try again.';
		}
	});

	async function handleOAuthLogin(provider: AuthProviderConfig) {
		try {
			loading = true;
			error = '';
			
			// Get callback URL from current URL params or default to home
			let callbackUrl = page.url.searchParams.get('callbackUrl') || '/';
			
			// Validate callbackUrl to prevent open redirects
			// Must start with / and NOT start with // (protocol relative)
			if (!callbackUrl.startsWith('/') || callbackUrl.startsWith('//')) {
				console.warn('[Security] Invalid callbackUrl detected, resetting to /:', callbackUrl);
				callbackUrl = '/';
			}
			
			// Initiate OAuth login
			await loginClient.initiateLogin(provider.id, callbackUrl);
		} catch (err) {
			console.error('Login error:', err);
			error = getErrorMessage(err, 'Failed to initiate login');
			loading = false;
		}
	}
</script>

<div class="flex min-h-full flex-col items-center justify-center bg-background px-4 py-4">
	<!-- Brand Header -->
	<div class="mb-8 scale-150 flex items-center gap-2">
		<img src={brand.meta.icons.logo} alt="App Logo" class="h-6 w-6" />
		<BrandTitle />
	</div>

	<!-- Main Card -->
	<div class="w-full max-w-sm space-y-5 rounded-lg border border-border bg-surface p-8 shadow-xs">
		<div class="space-y-2 text-center">
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">Sign In Required</h1>
			<p class="text-sm text-muted-foreground">
				This system is authorized for Controlled Unclassified Information (CUI).
			</p>
		</div>

		<!-- Warning Banner -->
		<div class="rounded-md border border-warning-border bg-warning-background p-3 text-xs text-warning-foreground">
			<p class="font-medium">US GOVERNMENT NOTICE</p>
			<p class="mt-1 opacity-90">
				You are accessing a U.S. Government information system. Usage may be monitored, recorded, and subject to audit.
			</p>
		</div>

		<!-- Login Buttons -->
		<div class="space-y-3">
			{#if providers.length === 0}
				<div class="text-center text-sm text-muted-foreground">
					No authentication providers configured. Check system logs.
				</div>
			{:else}
				{#each providers as provider (provider.id)}
					{@const icon = getProviderIcon(provider.id)}
					<Button
						variant={provider.preferredVariant || 'outline'}
						class="w-full gap-2 transition-all hover:scale-[1.02]"
						size="lg"
						onclick={() => handleOAuthLogin(provider)}
						disabled={loading}
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- icon is a hardcoded SVG string from $lib/icons/custom-icons -->
						{@html icon}
						Sign in with {provider.name}
					</Button>
				{/each}
			{/if}
		</div>

		<!-- Error Message -->
		{#if error}
			<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive text-center font-medium">
				{error}
			</div>
		{/if}
	</div>

	<!-- Footer -->
	<div class="mt-8 text-center text-xs text-muted-foreground">
		<p>&copy; {new Date().getFullYear()} {brand.copyright}. All rights reserved.</p>
	</div>
</div>
