<script lang="ts">
	import { untrack } from 'svelte';
	import { Loader2, AlertTriangle } from 'lucide-svelte';
	import Button from '$lib/components/ui/button.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { getErrorMessage } from '$lib/errors';
	import { documentStore } from '$lib/stores/documents.svelte';
	import {
		getTemplateByDocumentId,
		updateTemplateContent,
		resetTemplateToPublished,
		type LibraryTemplateDetail
	} from '$lib/services/templates/library-client';

	interface Props {
		documentId: string;
		documentContentHash: string | null;
	}

	let { documentId, documentContentHash }: Props = $props();

	let existingTemplate = $state<LibraryTemplateDetail | null>(null);
	let isUpdatingContent = $state(false);
	let isResetting = $state(false);

	let isDiverged = $derived(
		existingTemplate !== null && 
		documentContentHash !== existingTemplate.content_hash
	);

	async function checkDivergence(docId: string) {
		try {
			const template = await getTemplateByDocumentId(docId);
			// Only update if this is still the active document (handle race conditions)
			if (docId === documentId) {
				existingTemplate = template;
			}
		} catch (err) {
			// Only update if this is still the active document
			if (docId === documentId) {
				const errMsg = err instanceof Error ? err.message : '';
				// If not found, it just means it's not a published template.
				if (!errMsg.includes('404') && !errMsg.includes('not found')) {
					console.error('Failed to check template divergence:', err);
				}
				existingTemplate = null;
			}
		}
	}

	// Re-check when document changes
	$effect(() => {
		const docId = documentId;
		untrack(() => {
			// Reset state immediately when documentId changes to prevent race conditions
			// comparing new document props against old template data.
			existingTemplate = null;

			if (docId) {
				checkDivergence(docId);
			}
		});
	});

	async function handleUpdateContent() {
		if (!existingTemplate || isUpdatingContent) return;
		if (!window.confirm('Update the published template with your current document content?')) return;
		
		const currentDocId = documentId;
		isUpdatingContent = true;
		try {
			// Ensure any pending edits are flushed to the backend first
			const currentContent = documentStore.loadedDocument?.content;
			if (currentContent && documentStore.activeDocumentId === currentDocId) {
				await documentStore.saveDocument(currentDocId, currentContent);
			}

			const updated = await updateTemplateContent(existingTemplate.id);
			if (currentDocId === documentId) {
				existingTemplate = updated;
				toastStore.success('Template content updated');
				// Re-check just to sync hashes perfectly. It should already match, 
				// but a fresh fetch is safe.
				await checkDivergence(currentDocId);
			}
		} catch (err) {
			toastStore.error(getErrorMessage(err, 'Failed to update content'));
		} finally {
			if (currentDocId === documentId) {
				isUpdatingContent = false;
			}
		}
	}

	async function handleResetToPublished() {
		if (!existingTemplate || isResetting) return;
		if (!window.confirm('Reset this document to match the published template? You will lose any unpublished changes.')) return;

		const currentDocId = documentId;
		isResetting = true;
		try {
			await resetTemplateToPublished(existingTemplate.id);
			// Re-fetch authoritative template
			const freshTemplate = await getTemplateByDocumentId(currentDocId);
			
			if (currentDocId === documentId) {
				existingTemplate = freshTemplate;
				
				// Update local metadata to match the new hash, preventing banner from reappearing
				try {
					await documentStore.updateDocument(currentDocId, { content_hash: freshTemplate.content_hash });
				} catch {
					// Best-effort; the local content reset below is what matters.
				}

				// Update the local store so editor UI updates immediately
				documentStore.updateLoadedContent(freshTemplate.content);
				
				toastStore.success('Document reset to published state');
			}
		} catch (err) {
			toastStore.error(getErrorMessage(err, 'Failed to reset document'));
		} finally {
			if (currentDocId === documentId) {
				isResetting = false;
			}
		}
	}
</script>

{#if isDiverged}
	<div class="absolute top-0 left-0 right-0 z-canvas-ui flex flex-col items-center justify-between gap-3 bg-warning/80 px-4 py-3 text-warning-foreground shadow-sm backdrop-blur-sm sm:flex-row">
		<div class="flex items-center gap-2 text-sm font-medium">
			<AlertTriangle class="h-4 w-4" />
			<span>Your document has unpublished changes</span>
		</div>
		<div class="flex items-center gap-2">
			<Button 
				variant="outline" 
				size="sm" 
				class="h-7 border-warning-foreground/20 bg-background/50 hover:bg-background/80"
				onclick={handleResetToPublished}
				disabled={isResetting || isUpdatingContent}
			>
				{#if isResetting}
					<Loader2 class="mr-1.5 h-3 w-3 animate-spin" />
				{/if}
				Reset to Published
			</Button>
			<Button 
				variant="default" 
				size="sm" 
				class="h-7 bg-foreground text-background hover:bg-foreground/90"
				onclick={handleUpdateContent}
				disabled={isResetting || isUpdatingContent}
			>
				{#if isUpdatingContent}
					<Loader2 class="mr-1.5 h-3 w-3 animate-spin" />
				{/if}
				Update Template
			</Button>
		</div>
	</div>
{/if}
