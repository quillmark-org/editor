<script lang="ts">
	import { Globe, Link2, Users, Cloud, MonitorSmartphone, Save, LogIn, Star } from 'lucide-svelte';
	import Dialog from '$lib/components/ui/base-dialog.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import { loginClient } from '$lib/services/auth';
	import type { AuthProviderConfig } from '$lib/services/auth/types';
	import { getErrorMessage } from '$lib/errors';
	import { getProviderIcon } from '$lib/icons/custom-icons';

	interface Props {
		providers: AuthProviderConfig[];
		open: boolean;
		onOpenChange: (open: boolean) => void;
		documentName?: string;
		action?: 'publish' | 'share' | 'save' | 'star' | 'session_expired';
	}

	let { providers, open, onOpenChange, documentName, action = 'publish' }: Props = $props();

	const isSessionExpired = $derived(action === 'session_expired');

	// State management
	let loading = $state(false);
	let error = $state('');

	async function handleOAuthLogin(provider: AuthProviderConfig) {
		try {
			loading = true;
			error = '';
			await loginClient.initiateLogin(provider.id);
		} catch (err) {
			console.error('Login error:', err);
			error = getErrorMessage(err, 'Failed to initiate login');
		} finally {
			loading = false;
		}
	}
</script>

<Dialog
	{open}
	{onOpenChange}
	size="sm"
	elevated
	hideCloseButton={isSessionExpired}
	closeOnEscape={!isSessionExpired}
	closeOnOutsideClick={!isSessionExpired}
>
	{#snippet header()}
		<div class="flex items-center gap-3">
			<div
				class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"
			>
				{#if action === 'publish'}
					<Globe class="h-5 w-5" />
				{:else if action === 'star'}
					<Star class="h-5 w-5" />
				{:else if isSessionExpired}
					<LogIn class="h-5 w-5" />
				{:else}
					<Save class="h-5 w-5" />
				{/if}
			</div>
			<div>
				<h2 class="text-lg font-semibold text-foreground">
					{#if action === 'publish'}
						Sign in to publish
					{:else if action === 'share'}
						Sign in to share
					{:else if action === 'star'}
						Sign in to star templates
					{:else if isSessionExpired}
						Session Expired
					{:else}
						Sign in to save
					{/if}
				</h2>
			</div>
		</div>
	{/snippet}

	{#snippet content()}
		<div class="space-y-6">
			<!-- Context message -->
			<p class="text-sm text-muted-foreground">
				{#if action === 'publish'}
					{#if documentName}
						Sign in to publish <span class="font-medium text-foreground">"{documentName}"</span>.
					{:else}
						Sign in to publish your documents.
					{/if}
				{:else if action === 'share'}
					{#if documentName}
						Sign in to share <span class="font-medium text-foreground">"{documentName}"</span>.
					{:else}
						Sign in to share your documents.
					{/if}
				{:else if isSessionExpired}
					Your session has expired. Sign in again to continue.
				{:else if action === 'star'}
					Sign in to star and filter your favorite templates.
				{:else}
					{#if documentName}
						Sign in to save <span class="font-medium text-foreground">"{documentName}"</span> to your account.
					{:else}
						Sign in to save your documents to your account.
					{/if}
				{/if}
			</p>

			<!-- Benefits list -->
			<div class="space-y-3">
				{#if isSessionExpired}
					<!-- No benefits list for session expired -->
				{:else if action === 'publish' || action === 'share'}
					<div class="flex items-start gap-3">
						<div
							class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent"
						>
							<Link2 class="h-3.5 w-3.5 text-accent-foreground" />
						</div>
						<div class="text-sm text-muted-foreground">
							Generate a shared link anyone can view
						</div>
					</div>
					<div class="flex items-start gap-3">
						<div
							class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent"
						>
							<Users class="h-3.5 w-3.5 text-accent-foreground" />
						</div>
						<div class="text-sm text-muted-foreground">
							Let others fork and edit their own copy
						</div>
					</div>
				{:else}
					<div class="flex items-start gap-3">
						<div
							class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent"
						>
							<Cloud class="h-3.5 w-3.5 text-accent-foreground" />
						</div>
						<div class="text-sm text-muted-foreground">
							Securely back up your documents to the cloud
						</div>
					</div>
					<div class="flex items-start gap-3">
						<div
							class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent"
						>
							<MonitorSmartphone class="h-3.5 w-3.5 text-accent-foreground" />
						</div>
						<div class="text-sm text-muted-foreground">
							Access your work from any device
						</div>
					</div>
				{/if}
			</div>

			<!-- Divider -->
			<div class="relative">
				<div class="absolute inset-0 flex items-center">
					<div class="w-full border-t border-border"></div>
				</div>
				<div class="relative flex justify-center text-xs uppercase">
					<span class="bg-surface-elevated px-2 text-muted-foreground">Continue with</span>
				</div>
			</div>

			<!-- Login buttons -->
			{#if providers.length === 0}
				<div class="text-center text-sm text-muted-foreground">Loading...</div>
			{:else}
				<div class="space-y-3">
					{#each providers as provider (provider.id)}
						{@const icon = getProviderIcon(provider.id)}
						<Button
							variant={provider.preferredVariant || 'outline'}
							class="w-full justify-center gap-2"
							onclick={() => handleOAuthLogin(provider)}
							disabled={loading}
							aria-label={`Sign in with ${provider.name}`}
						>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- icon is a hardcoded SVG string from $lib/icons/custom-icons -->
							{@html icon}
							{provider.name}
						</Button>
					{/each}

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
	{/snippet}

</Dialog>
