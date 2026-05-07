<script lang="ts">
	import { Copy, Check, Loader2, Lock, Globe } from 'lucide-svelte';
	import { page } from '$app/state';
	import Dialog from '$lib/components/ui/base-dialog.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import { documentStore } from '$lib/stores/documents.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { DocumentMetadata } from '$lib/services/documents/types';

	const guestMode = $derived(page.data.config.auth.guestMode);

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		document?: DocumentMetadata | null;
	}

	let { open, onOpenChange, document = null }: Props = $props();

	// Local state
	let isUpdating = $state(false);
	let copied = $state(false);

	// Derived state
	let isGuest = $derived(documentStore.isGuest);
	let isPublic = $derived(document?.is_public ?? false);
	let isUnsavedDocument = $derived(Boolean(document?.id?.startsWith('temp-')));
	let canManageSharing = $derived(Boolean(document && !isGuest && !isUnsavedDocument));
	let publicUrl = $derived(
		document && typeof window !== 'undefined'
			? `${window.location.origin}/doc/${document.id}`
			: ''
	);

	// Reset copied state when modal closes
	$effect(() => {
		if (!open) {
			copied = false;
		}
	});

	async function handleToggle(checked: boolean) {
		if (!document || checked === isPublic) return;
		if (isGuest) return;
		if (isUnsavedDocument) {
			toastStore.error('Save this document before changing sharing settings');
			return;
		}

		isUpdating = true;
		try {
			await documentStore.setPublic(document.id, checked);
			toastStore.success(checked ? 'Document is now shared' : 'Document is now private');
		} catch {
			// Error already handled by store, just show toast
			toastStore.error('Failed to update sharing settings');
		} finally {
			isUpdating = false;
		}
	}

	async function handleCopy() {
		if (!publicUrl || !isPublic) return;

		try {
			await navigator.clipboard.writeText(publicUrl);
			copied = true;
			toastStore.success('Link copied to clipboard');

			// Reset copied state after 2 seconds
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch {
			toastStore.error('Failed to copy link');
		}
	}
</script>

<Dialog {open} {onOpenChange} title="Share Document" size="sm" scoped>
	{#snippet content()}
		{#if isGuest}
			<!-- Guest mode message -->
			<div class="space-y-4">
				<p class="text-sm text-muted-foreground">
					Sign in to share your documents. Shared documents can be viewed by anyone with
					the link.
				</p>
			</div>
		{:else if !document}
			<!-- No document selected -->
			<p class="text-sm text-muted-foreground">No document selected.</p>
		{:else}
			<!-- Authenticated user with document -->
			<div class="space-y-6">
				<!-- Access Selection Cards -->
				<div role="radiogroup" aria-label="Document access">
					<button
						type="button"
						role="radio"
						aria-checked={!isPublic}
						disabled={isUpdating || !canManageSharing}
						onclick={() => handleToggle(false)}
						class="flex w-full items-center gap-3 rounded-t-lg border border-border bg-surface p-4 text-left transition-colors hover:bg-accent/50 disabled:cursor-not-allowed"
					>
						<Lock class="h-5 w-5 shrink-0 text-muted-foreground" />
						<div class="min-w-0 flex-1">
							<div class="text-sm font-medium text-foreground">Private</div>
							<div class="text-xs text-muted-foreground">Only you have access</div>
						</div>
						<div class="flex h-5 w-5 shrink-0 items-center justify-center">
							{#if isUpdating && !isPublic}
								<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
							{:else if !isPublic}
								<Check class="h-5 w-5 text-primary" />
							{:else}
								<span class="h-5 w-5" aria-hidden="true"></span>
							{/if}
						</div>
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={isPublic}
						disabled={isUpdating || !canManageSharing}
						onclick={() => handleToggle(true)}
						class="flex w-full items-center gap-3 rounded-b-lg border border-t-0 border-border bg-surface p-4 text-left transition-colors hover:bg-accent/50 disabled:cursor-not-allowed"
					>
						<Globe class="h-5 w-5 shrink-0 text-muted-foreground" />
						<div class="min-w-0 flex-1">
							<div class="text-sm font-medium text-foreground">Shared</div>
							<div class="text-xs text-muted-foreground">
								{!guestMode
									? 'Only authenticated users can view the link'
									: 'Anyone with the link can view'}
							</div>
						</div>
						<div class="flex h-5 w-5 shrink-0 items-center justify-center">
							{#if isUpdating && isPublic}
								<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
							{:else if isPublic}
								<Check class="h-5 w-5 text-primary" />
							{:else}
								<span class="h-5 w-5" aria-hidden="true"></span>
							{/if}
						</div>
					</button>
				</div>

				{#if isUnsavedDocument}
					<p class="text-xs text-muted-foreground">
						Save this document before changing sharing settings.
					</p>
				{/if}

				<!-- Share Link -->
			<div class="space-y-2" class:opacity-50={!isPublic}>
				<label for="share-link" class="text-sm font-medium text-foreground">Shared Link</label>
				<div class="flex gap-2">
					<input
						id="share-link"
						type="text"
						readonly
						value={publicUrl}
						aria-label="Shared link"
						disabled={!isPublic || !canManageSharing}
						class="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground transition-colors disabled:cursor-not-allowed"
					/>
					<Button
						variant="outline"
						size="sm"
						onclick={handleCopy}
						aria-label="Copy link to clipboard"
						class="shrink-0"
						disabled={!isPublic || !canManageSharing}
					>
						{#if copied}
							<Check class="h-4 w-4 text-success" />
						{:else}
							<Copy class="h-4 w-4" />
						{/if}
					</Button>
				</div>
			</div>
			</div>
		{/if}
	{/snippet}

</Dialog>
