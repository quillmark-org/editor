<script lang="ts">
	import Dialog from '$lib/components/ui/base-dialog.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import { documentStore } from '$lib/stores/documents.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		documentName?: string;
		onPromoteSuccess?: () => void;
	}

	let { 
		open, 
		onOpenChange, 
		documentName = 'this document',
		onPromoteSuccess 
	}: Props = $props();

	let isPromoting = $state(false);

	async function handlePromote() {
		if (!documentStore.activeDocumentId) return;

		isPromoting = true;
		try {
			await documentStore.promoteLocalDocument(documentStore.activeDocumentId);
			toastStore.success('Document saved to your account');
			onOpenChange(false);
			onPromoteSuccess?.();
		} catch (err) {
			console.error('Failed to promote document:', err);
			toastStore.error('Failed to save document to account');
		} finally {
			isPromoting = false;
		}
	}
</script>

<Dialog {open} {onOpenChange} title="Save to Account" size="sm">
	{#snippet content()}
		<div class="space-y-4">
			<p class="text-sm text-muted-foreground">
				To publish <span class="font-medium text-foreground">"{documentName}"</span>, you first need to save it to your account.
			</p>
		</div>
	{/snippet}

	{#snippet footer()}
		<Button variant="default" onclick={handlePromote} disabled={isPromoting} loading={isPromoting}>
			{isPromoting ? 'Saving...' : 'Save to Account'}
		</Button>
	{/snippet}
</Dialog>
