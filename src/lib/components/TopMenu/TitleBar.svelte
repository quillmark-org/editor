<script lang="ts">
	import { DEFAULT_DOCUMENT_NAME } from '$lib/utils/document-naming';

	// UI Components
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import InlineEditableTitle from '$lib/components/ui/inline-editable-title.svelte';

	// Icons
	import { Check, Loader2, AlertCircle, Menu } from 'lucide-svelte';

	// Stores & Services
	import { documentStore } from '$lib/stores/documents.svelte';
	import { responsiveStore } from '$lib/stores/responsive.svelte';

	// Types
	import type { SaveStatus } from '$lib/utils/auto-save.svelte';

	type TitleBarProps = {
		fileName: string;
		saveStatus?: SaveStatus;
		saveError?: string;
		sidebarExpanded?: boolean;
		onToggleSidebar?: () => void;
	};

	let {
		fileName,
		saveStatus = 'idle',
		saveError,
		sidebarExpanded = false,
		onToggleSidebar
	}: TitleBarProps = $props();

	let isEditing = $state(false);
	let isSaving = $state(false);

	const isNarrowViewport = $derived(responsiveStore.isNarrowViewport);

	async function handleTitleCommit(newName: string) {
		if (documentStore.activeDocumentId) {
			isSaving = true;
			try {
				await documentStore.updateDocument(documentStore.activeDocumentId, { name: newName });
			} catch (err) {
				console.error('Failed to update document name:', err);
			} finally {
				isSaving = false;
			}
		}
	}

	function handleToggleSidebar() {
		if (onToggleSidebar) {
			onToggleSidebar();
		}
	}
</script>

<div class="flex min-w-0 items-center gap-2" style="height: 3.1rem;">
	<!-- Hamburger Menu (Mobile only) -->
	{#if isNarrowViewport}
		<div class="relative shrink-0 flex items-center justify-center" style="width: 48px; margin-left: -16px;">
			<button
				class="hamburger-button"
				onclick={handleToggleSidebar}
				aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
				aria-expanded={sidebarExpanded}
			>
				<Menu class="hamburger-icon" />
			</button>
		</div>
	{/if}

	<!-- Title wrapper with auto-sizing -->
	<div class="min-w-0 overflow-hidden">
		<Tooltip content="Rename Document" position="bottom" delay={400} offset={4} class="p-1 text-xs text-foreground/50">
			<span
				class="group min-w-0 max-w-full cursor-text overflow-hidden rounded-sm px-2 py-1 text-foreground/80 transition-colors {isEditing ? 'bg-background' : 'hover:bg-background'}"
				role="button"
				tabindex={isEditing ? -1 : 0}
				onclick={() => !isEditing && (isEditing = true)}
				onkeydown={(e) => !isEditing && e.key === 'Enter' && (isEditing = true)}
			>
				<InlineEditableTitle
					value={fileName}
					bind:isEditing
					onCommit={handleTitleCommit}
					class="min-w-0 max-w-full"
					textClass="text-lg font-medium {fileName === DEFAULT_DOCUMENT_NAME ? 'text-muted-foreground' : ''}"
					inputClass="text-lg font-medium text-foreground/80"
					ariaLabel="Edit document title"
				/>
			</span>
		</Tooltip>
	</div>

	{#if isSaving}
		<div class="flex items-center gap-1 text-xs text-muted-foreground">
			<Loader2 class="h-3 w-3 animate-spin" />
			<span>Renaming...</span>
		</div>
	{/if}

	<!-- Save Status Indicator -->
	{#if saveStatus === 'saving'}
		<div class="flex items-center gap-1 text-xs text-muted-foreground">
			<Loader2 class="h-3 w-3 animate-spin" />
			<span>Saving...</span>
		</div>
	{:else if saveStatus === 'saved'}
		<div class="flex items-center gap-1 text-xs text-muted-foreground">
			<Check class="h-3 w-3" />
			<span>{documentStore.isGuest ? 'Saved' : 'Synced'}</span>
		</div>
	{:else if saveStatus === 'error'}
		<div class="flex items-center gap-1 text-xs text-destructive" title={saveError}>
			<AlertCircle class="h-3 w-3" />
			<span>Error</span>
		</div>
	{/if}
</div>

<style>
	.hamburger-button {
		width: 100%;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		color: rgb(from var(--color-foreground) r g b / 0.7);
		cursor: pointer;
		padding: 0;
		transition: color 0.2s;
	}

	.hamburger-button:hover {
		color: var(--color-foreground);
	}

	.hamburger-button:active {
		transform: scale(0.985);
	}

	:global(.hamburger-icon) {
		width: 24px;
		height: 24px;
		flex-shrink: 0;
	}
</style>
