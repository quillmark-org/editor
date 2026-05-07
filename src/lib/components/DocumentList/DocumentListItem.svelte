<script lang="ts">
	import { Trash2, Upload, Copy, Users, Globe } from 'lucide-svelte';
	import Button from '$lib/components/ui/button.svelte';
	import InlineEditableTitle from '$lib/components/ui/inline-editable-title.svelte';
	import { documentStore } from '$lib/stores/documents.svelte';
	import { editorModalCommandsStore } from '$lib/stores/editor-modal-commands.svelte';

	type DocumentListItemProps = {
		document: {
			id: string;
			name: string;
		};
		isActive: boolean;
		onSelect: (id: string) => void;
		onDelete?: (id: string) => void;
		/** Optional callback to rename the document */
		onRename?: (id: string, newName: string) => Promise<void> | void;
		/** Optional callback to promote/upload the document */
		onPromote?: (id: string) => void;
		/** Whether the document is currently being promoted */
		isPromoting?: boolean;
		/** Optional callback to duplicate the document */
		onDuplicate?: (id: string) => void;
		/** Whether the document is currently being duplicated */
		isDuplicating?: boolean;
		/** Whether the document is shared */
		isPublic?: boolean;
		/** Whether the document is a template */
		isTemplate?: boolean;
	};

	let {
		document,
		isActive,
		onSelect,
		onDelete,
		onRename,
		onPromote,
		isPromoting = false,
		onDuplicate,
		isDuplicating = false,
		isPublic = false,
		isTemplate = false
	}: DocumentListItemProps = $props();

	let isEditingName = $state(false);

	function handleNameDblClick(e: MouseEvent) {
		if (!onRename) return;
		e.stopPropagation();
		isEditingName = true;
	}

	function handleNameCommit(newName: string) {
		return onRename?.(document.id, newName);
	}
</script>

<div
	class="group flex h-8 items-center gap-1 rounded pr-2 transition-transform {isActive
		? 'bg-accent active:scale-100'
		: 'hover:bg-accent/50 active:scale-[0.985]'}"
>
	<div
		class="flex flex-1 h-full items-center overflow-hidden px-2 text-xs transition-colors cursor-pointer select-none {isActive
			? 'font-medium text-foreground'
			: 'text-muted-foreground hover:text-foreground'}"
		role="button"
		tabindex="0"
		onclick={() => !isEditingName && onSelect(document.id)}
		ondblclick={handleNameDblClick}
		onkeydown={(e) => {
			if (e.key === 'Enter' && !isEditingName) onSelect(document.id);
		}}
		aria-label={document.name}
	>
		{#if onRename}
			<InlineEditableTitle
				value={document.name}
				bind:isEditing={isEditingName}
				onCommit={handleNameCommit}
				class="min-w-0 max-w-full"
				textClass="overflow-hidden text-ellipsis whitespace-nowrap"
				inputClass="text-xs"
				ariaLabel="Rename {document.name}"
			/>
		{:else}
			<span class="truncate">{document.name}</span>
		{/if}
	</div>

	{#if isPublic}
		<Button
			variant="ghost"
			size="icon"
			class="doc-action-btn share-btn h-5 w-5 shrink-0 p-0 transition-all text-info opacity-0 group-hover:opacity-80 focus:opacity-80! hover:bg-transparent hover:opacity-100! active:scale-95 {isActive
				? 'opacity-60'
				: ''}"
			onclick={(e: MouseEvent) => {
				e.stopPropagation();
				documentStore.selectDocument(document.id);
				editorModalCommandsStore.openModal('share');
			}}
			aria-label="Manage sharing for {document.name}"
			title="Manage sharing"
		>
			<Users class="h-3.5 w-3.5" />
		</Button>
	{/if}

	{#if isTemplate}
		<Button
			variant="ghost"
			size="icon"
			class="doc-action-btn publish-btn h-5 w-5 shrink-0 p-0 transition-all text-info opacity-0 group-hover:opacity-80 focus:opacity-80! hover:bg-transparent hover:opacity-100! active:scale-95 {isActive
				? 'opacity-60'
				: ''}"
			onclick={(e: MouseEvent) => {
				e.stopPropagation();
				documentStore.selectDocument(document.id);
				editorModalCommandsStore.openModal('publish');
			}}
			aria-label="Publish/Manage template {document.name}"
			title="Publish template"
		>
			<Globe class="h-3.5 w-3.5" />
		</Button>
	{/if}

	{#if onPromote}
		<Button
			variant="ghost"
			size="icon"
			class="doc-action-btn promote-btn h-5 w-5 shrink-0 p-0 opacity-0 transition-all group-hover:opacity-60 focus:opacity-50! hover:bg-transparent hover:opacity-100! active:scale-95 {isActive
				? 'opacity-60'
				: ''}"
			onclick={(e: MouseEvent) => {
				e.stopPropagation();
				onPromote?.(document.id);
			}}
			disabled={isPromoting}
			aria-label="Save {document.name} to account"
			title="Save to account"
		>
			{#if isPromoting}
				<div class="promote-spinner"></div>
			{:else}
				<Upload class="h-4 w-4" />
			{/if}
		</Button>
	{/if}

	{#if onDuplicate}
		<Button
			variant="ghost"
			size="icon"
			class="doc-action-btn duplicate-btn h-5 w-5 shrink-0 p-0 opacity-0 transition-all group-hover:opacity-60 focus:opacity-50! hover:bg-transparent hover:opacity-100! active:scale-95 {isActive
				? 'opacity-60'
				: ''}"
			onclick={(e: MouseEvent) => {
				e.stopPropagation();
				onDuplicate?.(document.id);
			}}
			disabled={isDuplicating}
			aria-label="Duplicate {document.name}"
			title="Duplicate"
		>
			{#if isDuplicating}
				<div class="duplicate-spinner"></div>
			{:else}
				<Copy class="h-4 w-4" />
			{/if}
		</Button>
	{/if}

	{#if onDelete}
		<Button
			variant="ghost"
			size="icon"
			class="doc-action-btn delete-btn h-5 w-5 shrink-0 p-0 opacity-0 transition-all group-hover:opacity-60 focus:opacity-50! hover:bg-transparent hover:opacity-100! active:scale-95 {isActive
				? 'opacity-60'
				: ''}"
			onclick={(e: MouseEvent) => {
				e.stopPropagation();
				onDelete?.(document.id);
			}}
			aria-label="Delete {document.name}"
		>
			<Trash2 class="h-4 w-4" />
		</Button>
	{/if}
</div>

<style>
	/* Shared document action button base styles */
	:global(.doc-action-btn) {
		color: var(--color-muted-foreground);
	}

	/* Delete button specific hover - destructive color */
	:global(.delete-btn):hover {
		color: var(--color-destructive-muted);
	}

	/* Promote button specific hover - primary color */
	:global(.promote-btn):hover {
		color: var(--color-primary);
	}

	/* Share button - info blue (token-driven, theme-aware) */
	:global(.share-btn),
	:global(.share-btn):hover {
		color: var(--color-info);
	}

	/* Publish button - info blue (token-driven, theme-aware) */
	:global(.publish-btn),
	:global(.publish-btn):hover {
		color: var(--color-info);
	}

	/* Duplicate button specific hover - accent foreground */
	:global(.duplicate-btn):hover {
		color: var(--color-foreground);
	}

	/* Duplicate spinner */
	.duplicate-spinner {
		width: 0.75rem;
		height: 0.75rem;
		border: 2px solid var(--color-muted);
		border-top-color: var(--color-foreground);
		border-radius: 50%;
		animation: promote-spin 600ms linear infinite;
	}

	/* Promote spinner */
	.promote-spinner {
		width: 0.75rem;
		height: 0.75rem;
		border: 2px solid var(--color-muted);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: promote-spin 600ms linear infinite;
	}

	@keyframes promote-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.promote-spinner,
		.duplicate-spinner {
			animation-duration: 0.01ms !important;
		}
	}
</style>
