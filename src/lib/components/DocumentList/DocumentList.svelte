<script lang="ts">
	import { DocumentListItem } from '$lib/components/DocumentList';
	import BaseDialog from '$lib/components/ui/base-dialog.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import CollapsibleSection from '$lib/components/ui/collapsible-section.svelte';
	import { documentStore } from '$lib/stores/documents.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { loginModalStore } from '$lib/stores/login-modal.svelte';
	import type { DocumentSection } from '$lib/stores/documents.svelte';
	import type { DocumentMetadata } from '$lib/services/documents/types';

	type Props = {
		onAction?: () => void;
	};

	let { onAction }: Props = $props();

	let promotingDocumentId = $state<string | null>(null);
	let duplicatingDocumentId = $state<string | null>(null);
	let deleteConfirmDocument = $state<{ id: string; name: string } | null>(null);
	type Section = {
		key: DocumentSection;
		label: string;
		docs: DocumentMetadata[];
		showDelete?: boolean;
		showRename?: boolean;
		showDuplicate?: boolean;
		showPromote?: boolean;
		isTemplate?: boolean;
	};

	const sections = $derived.by(() => {
		const result: Section[] = [];
		if (documentStore.templateDocuments.length > 0) {
			result.push({
				key: 'templates',
				label: 'Templates',
				docs: documentStore.templateDocuments,
				showRename: true,
				isTemplate: true
			});
		}
		if (documentStore.privateCloudDocuments.length > 0) {
			result.push({
				key: 'private',
				label: 'Your Docs',
				docs: documentStore.privateCloudDocuments,
				showDelete: true,
				showRename: true,
				showDuplicate: true
			});
		}
		if (documentStore.localDocuments.length > 0) {
			result.push({
				key: 'local',
				label: 'On device',
				docs: documentStore.localDocuments,
				showDelete: true,
				showRename: true,
				showDuplicate: true,
				showPromote: true
			});
		}
		return result;
	});

	function handleFileSelect(fileId: string) {
		documentStore.selectDocument(fileId);
		onAction?.();
	}

	function handleDeleteFile(fileId: string) {
		const doc = documentStore.documents.find((d) => d.id === fileId);
		if (doc) {
			deleteConfirmDocument = { id: doc.id, name: doc.name };
		}
	}

	function confirmDelete() {
		if (deleteConfirmDocument) {
			documentStore.deleteDocument(deleteConfirmDocument.id);
			deleteConfirmDocument = null;
		}
	}

	async function handleDuplicateDocument(id: string) {
		duplicatingDocumentId = id;
		try {
			const copy = await documentStore.duplicateDocument(id);
			if (copy) {
				toastStore.success(`Duplicated "${copy.name}"`);
				onAction?.();
			}
		} catch (error) {
			toastStore.error('Failed to duplicate document');
			console.error('Duplicate failed:', error);
		} finally {
			duplicatingDocumentId = null;
		}
	}

	async function handleRenameDocument(id: string, newName: string) {
		try {
			await documentStore.updateDocument(id, { name: newName });
		} catch (error) {
			toastStore.error('Failed to rename document');
			console.error('Rename failed:', error);
		}
	}

	async function handlePromoteDocument(id: string) {
		if (documentStore.isGuest) {
			const doc = documentStore.documents.find((d) => d.id === id);
			if (doc) {
				loginModalStore.show('save', { documentName: doc.name });
			}
			return;
		}

		promotingDocumentId = id;
		try {
			const promoted = await documentStore.promoteLocalDocument(id);
			toastStore.success(`Saved "${promoted.name}" to your account`);
		} catch (error) {
			toastStore.error('Failed to save document to account');
			console.error('Promote failed:', error);
		} finally {
			promotingDocumentId = null;
		}
	}
</script>

{#if sections.length > 0}
	<div class="space-y-1">
		{#each sections as section (section.key)}
			{@const expanded = !documentStore.isGroupCollapsed(section.key, false)}
			<CollapsibleSection
				label={section.label}
				{expanded}
				onToggle={() => documentStore.toggleGroupCollapse(section.key)}
				size="sm"
				buttonClass="pl-2"
				labelClass="doc-section-label"
			>
				{#each section.docs as doc (doc.id)}
					<DocumentListItem
						document={doc}
						isActive={doc.id === documentStore.activeDocumentId}
						onSelect={handleFileSelect}
						onDelete={section.showDelete ? handleDeleteFile : undefined}
						onRename={section.showRename ? handleRenameDocument : undefined}
						onDuplicate={section.showDuplicate ? handleDuplicateDocument : undefined}
						isDuplicating={duplicatingDocumentId === doc.id}
						onPromote={section.showPromote ? handlePromoteDocument : undefined}
						isPromoting={promotingDocumentId === doc.id}
						isPublic={doc.is_public}
						isTemplate={section.isTemplate ?? false}
					/>
				{/each}
			</CollapsibleSection>
		{/each}
	</div>
{/if}

<BaseDialog
	open={deleteConfirmDocument !== null}
	onOpenChange={(open) => {
		if (!open) deleteConfirmDocument = null;
	}}
	title="Delete Document"
	size="sm"
	hideCloseButton={true}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			Are you sure you want to delete <span class="font-medium text-foreground">"{deleteConfirmDocument?.name}"</span>?
		</p>
	{/snippet}
	{#snippet footer()}
		<Button variant="destructive" size="sm" onclick={confirmDelete}>Delete</Button>
		<Button variant="ghost" size="sm" onclick={() => (deleteConfirmDocument = null)}>Cancel</Button>
	{/snippet}
</BaseDialog>

<style>
	:global(.doc-section-label) {
		font-size: 0.75rem;
		font-weight: 500;
		user-select: none;
	}
</style>
