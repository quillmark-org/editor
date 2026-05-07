<script lang="ts">
	import { untrack } from 'svelte';
	import { Loader2, AlertTriangle, Trash2 } from 'lucide-svelte';
	import Dialog from '$lib/components/ui/base-dialog.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import ConfirmDialog from '$lib/components/ui/confirm-dialog.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import { page } from '$app/state';
	import { getErrorMessage } from '$lib/errors';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { documentStore } from '$lib/stores/documents.svelte';
	import { quillmarkService } from '$lib/services/quillmark';
	import type { LibraryTemplateDetail } from '$lib/services/templates/library-client';
	import {
		getTemplateByDocumentId,
		publishTemplate,
		updateTemplateMetadata,
		unpublishTemplate
	} from '$lib/services/templates/library-client';
	import { invalidateTemplateListCache } from '$lib/services/templates/template-prefetch.svelte';
	import {
		addStarredTemplateId,
		removeStarredTemplateId
	} from '$lib/services/templates/template-star-hints.svelte';

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		documentId: string;
		documentName: string;
		documentContent: string;
		isPublishedTemplate?: boolean;
	}

	let {
		open,
		onOpenChange,
		documentId,
		documentName,
		documentContent,
		isPublishedTemplate = false
	}: Props = $props();

	type ModalMode = 'loading' | 'publish' | 'manage' | 'error';
	let mode = $state<ModalMode>('loading');
	let initError = $state<string | null>(null);
	let existingTemplate = $state<LibraryTemplateDetail | null>(null);

	let title = $state('');
	let description = $state('');
	let parsedQuillRef = $state<string | null>(null);
	let publishAcknowledged = $state(false);

	const isSensitiveContent = $derived(page.data.config.classification.bannerTone === 'cui');

	let isPublishing = $state(false);
	let isSaving = $state(false);
	let isUnpublishing = $state(false);
	let showUnpublishConfirm = $state(false);

	let isFormDirty = $derived.by(() => {
		if (mode !== 'manage' || !existingTemplate) return false;
		return (
			title.trim() !== existingTemplate.title ||
			description.trim() !== (existingTemplate.description || '')
		);
	});

	let isFormValid = $derived(title.trim().length > 0);
	let canPublish = $derived(isFormValid && publishAcknowledged);

	async function parseFormatRef(content: string) {
		if (!content) {
			parsedQuillRef = null;
			return;
		}

		let doc: import('@quillmark/wasm').Document | null = null;
		try {
			if (!quillmarkService.isReady()) {
				await quillmarkService.initialize();
			}
			doc = quillmarkService.parseDocument(content);
			parsedQuillRef = doc.quillRef || null;
		} catch {
			parsedQuillRef = null;
		} finally {
			doc?.free();
		}
	}

	async function initModal(docId: string, docName: string, docContent: string, isTemplate: boolean) {
		mode = 'loading';
		initError = null;
		try {
			let templateResult: PromiseSettledResult<LibraryTemplateDetail> | undefined;

			if (isTemplate) {
				templateResult = await getTemplateByDocumentId(docId)
					.then((value) => ({ status: 'fulfilled' as const, value }))
					.catch((reason) => ({ status: 'rejected' as const, reason }));
			}

			if (docId !== documentId) return;

				if (isTemplate && templateResult?.status === 'fulfilled') {
					existingTemplate = templateResult.value;
					mode = 'manage';
					publishAcknowledged = false;
					title = existingTemplate.title;
				description = existingTemplate.description || '';
				await parseFormatRef(existingTemplate.content);
			} else {
				if (isTemplate && templateResult?.status === 'rejected') {
					const errMsg = templateResult.reason?.message || '';
					if (!errMsg.includes('404') && !errMsg.includes('not found')) {
						throw templateResult.reason;
					}
				}

					mode = 'publish';
					publishAcknowledged = false;
					title = docName;
				description = '';
				await parseFormatRef(docContent);
			}
		} catch (err) {
			if (docId === documentId) {
				initError = getErrorMessage(err, 'Failed to initialize publish modal');
				mode = 'error';
			}
		}
	}

	$effect(() => {
		if (open) {
			const snapDocId = documentId;
			const snapDocName = documentName;
			const snapDocContent = documentContent;
			const snapIsTemplate = isPublishedTemplate;
			untrack(() => {
				initModal(snapDocId, snapDocName, snapDocContent, snapIsTemplate);
			});
		} else {
				existingTemplate = null;
				mode = 'loading';
				showUnpublishConfirm = false;
				parsedQuillRef = null;
				publishAcknowledged = false;
			}
		});

	async function handlePublish() {
		if (!canPublish || isPublishing) return;
		isPublishing = true;
		try {
			const published = await publishTemplate({
				document_id: documentId,
				title: title.trim(),
				description: description.trim()
			});
			addStarredTemplateId(published.id);
			invalidateTemplateListCache();
			try {
				const res = await fetch('/api/documents');
				if (res.ok) {
					const data = await res.json();
					documentStore.initializeCloudDocuments(data.documents ?? []);
				}
			} catch {
				// Non-critical
			}
			toastStore.success('Template published successfully');
			onOpenChange(false);
		} catch (err) {
			toastStore.error(getErrorMessage(err, 'Failed to publish template'));
		} finally {
			isPublishing = false;
		}
	}

	async function handleSaveChanges() {
		if (!isFormValid || !isFormDirty || isSaving || !existingTemplate) return;
		isSaving = true;
		try {
			const updated = await updateTemplateMetadata(existingTemplate.id, {
				title: title.trim(),
				description: description.trim()
			});
			existingTemplate = updated;
			toastStore.success('Metadata saved');
		} catch (err) {
			toastStore.error(getErrorMessage(err, 'Failed to save changes'));
		} finally {
			isSaving = false;
		}
	}

	async function handleUnpublish() {
		if (!existingTemplate || isUnpublishing) return;
		isUnpublishing = true;
		try {
			await unpublishTemplate(existingTemplate.id);
			removeStarredTemplateId(existingTemplate.id);
			invalidateTemplateListCache();
			documentStore.removeDocumentLocally(documentId);
			toastStore.success('Template unpublished');
			showUnpublishConfirm = false;
			onOpenChange(false);
		} catch (err) {
			toastStore.error(getErrorMessage(err, 'Failed to unpublish template'));
		} finally {
			isUnpublishing = false;
		}
	}
</script>

{#if open}
	<Dialog
		{open}
		onOpenChange={(val) => {
			if (!val && !isPublishing && !isSaving && !isUnpublishing) {
				onOpenChange(false);
			}
		}}
		hideCloseButton={isPublishing || isSaving || isUnpublishing}
		closeOnEscape={!isPublishing && !isSaving && !isUnpublishing}
		closeOnOutsideClick={!isPublishing && !isSaving && !isUnpublishing}
		size="lg"
	>
		{#snippet header()}
			<h2 class="text-lg font-semibold text-foreground">
				{mode === 'publish' ? 'Publish Template' : mode === 'manage' ? 'Manage Template' : 'Template'}
			</h2>
		{/snippet}

		{#snippet content()}
			{#if mode === 'loading'}
				<div class="flex items-center justify-center p-12">
					<Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
				</div>
			{:else if mode === 'error'}
				<div class="flex flex-col items-center justify-center p-12 text-center">
					<AlertTriangle class="mb-4 h-8 w-8 text-destructive" />
					<p class="text-sm text-destructive">{initError}</p>
					<Button
						variant="outline"
						class="mt-4"
						onclick={() => initModal(documentId, documentName, documentContent, isPublishedTemplate)}
					>
						Retry
					</Button>
				</div>
				{:else}
						<div class="space-y-5">
							<div class="space-y-2">
								<label for="template-title" class="text-sm font-medium text-foreground">
									Template Title <span class="text-destructive">*</span>
						</label>
						<Input
							id="template-title"
							bind:value={title}
							placeholder="e.g. Daily Standup Notes"
							disabled={isPublishing || isSaving}
						/>
					</div>

					<div class="space-y-2">
						<label for="template-desc" class="text-sm font-medium text-foreground">Description</label>
						<textarea
							id="template-desc"
							bind:value={description}
							placeholder="Describe when and how to use this template..."
							class="min-h-[100px] w-full resize-y rounded-sm border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
							disabled={isPublishing || isSaving}
						></textarea>
					</div>

						{#if parsedQuillRef}
						<div class="space-y-2 pt-1">
							<p class="text-xs text-muted-foreground">Format</p>
							<div class="inline-flex items-center rounded bg-accent px-2 py-1 font-mono text-xs text-accent-foreground">
								{parsedQuillRef}
							</div>
						</div>
							{/if}

							{#if mode === 'publish'}
								<div class="rounded-md border border-warning-border bg-warning-background px-3 py-2 text-sm text-warning-foreground">
									{#if isSensitiveContent}
										<p class="mt-1">Template are visible to all users. Do not share sensitive info without approval.</p>
									{:else}
										<p class="mt-1">Template are visible to all users for creating new documents.</p>
									{/if}
									<label class="mt-2 flex items-start gap-2.5 leading-5">
										<input
											type="checkbox"
											class="mt-[2px] h-4 w-4 shrink-0 accent-warning-foreground"
											bind:checked={publishAcknowledged}
											disabled={isPublishing}
										/>
										<span class="text-sm">
											I confirm this template does not contain unauthorized sensitive information.
										</span>
									</label>
								</div>
							{/if}
					</div>
				{/if}
			{/snippet}

		{#snippet footer()}
			{#if mode === 'publish'}
				<div class="flex w-full justify-end gap-2">
						<Button variant="default" onclick={handlePublish} disabled={!canPublish || isPublishing} loading={isPublishing}>
						{isPublishing ? 'Publishing...' : 'Publish'}
					</Button>
				</div>
			{:else if mode === 'manage'}
				<div class="flex w-full items-center justify-between">
					<Button
						variant="ghost"
						class="text-destructive hover:bg-destructive/10 hover:text-destructive"
						onclick={() => (showUnpublishConfirm = true)}
						disabled={isUnpublishing || isSaving}
					>
						<Trash2 class="mr-2 h-4 w-4" />
						Unpublish
					</Button>
					<div class="flex gap-2">
						<Button
							variant="default"
							onclick={handleSaveChanges}
							disabled={!isFormValid || !isFormDirty || isSaving || isUnpublishing}
							loading={isSaving}
						>
							{isSaving ? 'Saving...' : 'Save Changes'}
						</Button>
					</div>
				</div>
			{/if}
		{/snippet}
	</Dialog>
{/if}

<ConfirmDialog
	open={showUnpublishConfirm}
	onOpenChange={(val) => (showUnpublishConfirm = val)}
	title="Unpublish Template"
	description="Are you sure you want to unpublish this template? It will be removed from the library and the linked document will be deleted."
	confirmLabel="Unpublish"
	variant="destructive"
	loading={isUnpublishing}
	onConfirm={handleUnpublish}
/>
