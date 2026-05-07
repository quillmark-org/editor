<script lang="ts">
	import Button from '$lib/components/ui/button.svelte';
	import { loginClient } from '$lib/services/auth';
	import type { AuthProviderConfig } from '$lib/services/auth/types';
	import { getErrorMessage } from '$lib/errors';
	import { getProviderIcon } from '$lib/icons/custom-icons';

	type LoginPopoverProps = {
		providers: AuthProviderConfig[];
	};

	let { providers }: LoginPopoverProps = $props();

	// State management
	let loading = $state(false);
	let error = $state('');

	async function handleOAuthLogin(provider: AuthProviderConfig) {
		try {
			loading = true;
			error = '';
			// Initiate OAuth login by redirecting
			await loginClient.initiateLogin(provider.id);
		} catch (err) {
			console.error('Login error:', err);
			error = getErrorMessage(err, 'Failed to initiate login');
		} finally {
			loading = false;
		}
	}
</script>

<div class="w-72 px-4">
	{#if providers.length === 0}
		<div class="text-center text-muted-foreground">No authentication providers available</div>
	{:else}
		<div class="space-y-3">
			{#each providers as provider (provider.id)}
				{@const icon = getProviderIcon(provider.id)}
				<Button
					variant={provider.preferredVariant || 'outline'}
					class="w-full justify-start gap-2"
					onclick={() => handleOAuthLogin(provider)}
					disabled={loading}
					aria-label={provider.name}
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- icon is a hardcoded SVG string from $lib/icons/custom-icons -->
					{@html icon}
					{provider.name}
				</Button>
			{/each}

			<!-- Error Message -->
			{#if error}
				<div
					class="rounded-md border border-error-border bg-error-background p-3 text-sm text-error-foreground"
				>
					{error}
				</div>
			{/if}
		</div>
	{/if}
</div>
