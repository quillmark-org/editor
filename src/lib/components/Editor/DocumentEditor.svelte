<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EllipsisVertical } from 'lucide-svelte';
	import { documentStore } from '$lib/stores/documents.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { responsiveStore } from '$lib/stores/responsive.svelte';
	import { AutoSave } from '$lib/utils/auto-save.svelte';
	import {
		MarkdownEditor,
		VisualEditor,
		AdvancedToolbar
	} from '$lib/components/Editor';
	import Preview from '$lib/components/Preview/Preview.svelte';
	import DocumentInfoDialog from '$lib/components/DocumentInfoDialog.svelte';
	import ImportFileDialog from '$lib/components/ImportFileDialog.svelte';
	import ShareModal from '$lib/components/ShareModal.svelte';
	import TemplatePublishModal from '$lib/components/TemplatePublishModal/TemplatePublishModal.svelte';
	import TemplateDivergenceBanner from '$lib/components/TemplateDivergenceBanner.svelte';
	import { quillmarkService } from '$lib/services/quillmark/service';
	import type { EditorMode } from '$lib/editor/prosemirror';
	import { useHotkey } from '$lib/services/hotkey';
	import { editorModalCommandsStore } from '$lib/stores/editor-modal-commands.svelte';
	import { ResizableSplit } from './resizable-split.svelte';

	interface Props {
		documentId: string | null;
		hasActiveDocument: boolean;
		autoSave: AutoSave;
		onContentChange?: (content: string) => void;
		onDocumentLoad?: (doc: { name: string; content: string }) => void;
		onPreviewStatusChange?: (hasSuccessfulPreview: boolean) => void;
		onCreateNewDocument?: () => void;
		mobileView?: 'editor' | 'preview';
		onMobileViewChange?: (view: 'editor' | 'preview') => void;
		isDocumentsLoading?: boolean;
	}

	let {
		documentId,
		hasActiveDocument,
		autoSave,
		onContentChange,
		onDocumentLoad,
		onPreviewStatusChange,
		onCreateNewDocument,
		mobileView = 'editor',
		onMobileViewChange,
		isDocumentsLoading = false
	}: Props = $props();

	// --- Modal state (tactic 1) ---
	let openModal = $state<'info' | 'import' | 'publish' | 'share' | null>(null);

	// --- Split-pane resize (tactic 2) ---
	const split = new ResizableSplit();
	let splitContainerElement = $state<HTMLDivElement | null>(null);

	// Manual save handler
	function handleManualSave() {
		if (hasActiveDocument && documentId && content) {
			// Trigger save in background
			autoSave.saveNow(documentId, content);
			return true;
		}
		return false;
	}

	useHotkey('editor.save', 'Mod-S', 'Save document', handleManualSave);

	// Derive content from store - single source of truth
	const loadedDoc = $derived(documentStore.loadedDocument);
	const content = $derived(loadedDoc?.content ?? '');
	const isContentReady = $derived(
		loadedDoc?.id === documentId &&
		!documentStore.isLoadingContent
	);
	const loading = $derived(documentStore.isLoadingContent);

	// Local state for debouncing (preview) and save tracking
	let debouncedContent = $state('');
	let debounceTimer: number | undefined;
	let editorRef = $state<MarkdownEditor | null>(null);
	let visualEditorRef = $state<VisualEditor | null>(null);
	let lastSaveStatus: 'idle' | 'saving' | 'saved' | 'error' = 'idle';

	// Track saved content for dirty detection
	let savedContent = $state('');

	// Editor mode state
	let editorMode = $state<EditorMode>('rich');

	// VisualEditor card focus state - kept in DocumentEditor to survive VisualEditor remounts
	let visualEditorActiveCardId = $state<number | 'main' | null>(null);

	// Reactive flag so the synchronous parse effect re-runs once the service is ready
	let quillmarkReady = $state(false);
	// Tracks which quill ref has successfully resolved.
	let resolvedQuillRef = $state<string | null>(null);

	// Derive the quill name from debounced content in the render phase so Preview's
	// quillName prop updates in the same cycle as its markdown prop.
	const parsedQuillName = $derived.by<string | null>(() => {
		if (!debouncedContent || !quillmarkReady) return null;
		let doc: import('@quillmark/wasm').Document | null = null;
		try {
			doc = quillmarkService.parseDocument(debouncedContent);
			return doc.quillRef || null;
		} catch {
			return null;
		} finally {
			doc?.free();
		}
	});

	// Editor pulse state - triggered when user clicks preview to guide them to editor
	let editorPulse = $state(false);

	/** Handle preview click - pulse the editor and switch to editor view on mobile */
	function handlePreviewClick() {
		// On mobile, switch to editor view
		if (isNarrowViewport) {
			onMobileViewChange?.('editor');
		}
		// Trigger pulse animation
		editorPulse = true;
		// Remove pulse class after animation completes
		setTimeout(() => {
			editorPulse = false;
		}, 800);
	}

	// Card-type tags from `info.cardTypes` — minimal external metadata the
	// VisualEditor needs for the card-type selector. Schemas + defaults come
	// from the live `quill.form(doc)` inside MetadataWidget.
	const cardTypes = $derived.by<readonly string[]>(() => {
		const quillId = parsedQuillName;
		if (!quillId || quillId !== resolvedQuillRef) return [];
		try {
			return quillmarkService.getQuillInfo(quillId).cardTypes;
		} catch {
			return [];
		}
	});

	$effect(() => {
		const quillId = parsedQuillName;
		if (!quillmarkReady || !quillId) {
			resolvedQuillRef = null;
			return;
		}

		// Clear resolved marker while this quill is being resolved.
		if (resolvedQuillRef !== quillId) {
			resolvedQuillRef = null;
		}

		let cancelled = false;
		quillmarkService
			.ensureQuillResolved(quillId)
			.then(() => {
				if (!cancelled && parsedQuillName === quillId) {
					resolvedQuillRef = quillId;
				}
			})
			.catch(() => {
				if (!cancelled && parsedQuillName === quillId) {
					resolvedQuillRef = null;
				}
			});

		return () => {
			cancelled = true;
		};
	});

	// Use centralized responsive store
	const isNarrowViewport = $derived(responsiveStore.isNarrowViewport);
	const editorPaneStyle = $derived(
		isNarrowViewport ? '' : `flex: 0 0 ${split.widthPercent}%;`
	);
	const previewPaneStyle = $derived(
		isNarrowViewport ? '' : `flex: 0 0 ${100 - split.widthPercent}%;`
	);

	// Handler for preview status changes
	function handlePreviewStatusChange(status: boolean) {
		onPreviewStatusChange?.(status);
	}

	// Track dirty state (unsaved changes)
	let isDirty = $derived(content !== savedContent);

	// Warn user before leaving the page with unsaved changes
	$effect(() => {
		// Sync dirty state to global store (for sign-out check)
		documentStore.setHasUnsavedChanges(isDirty);

		if (!isDirty) return;

		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			// Modern browsers ignore custom messages, but we need to return a value
			return '';
		};

		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		};
	});

	// Sync state when loaded document changes
	let previousLoadedId: string | null = null;
	$effect(() => {
		const loadedDoc = documentStore.loadedDocument;
		const loadedId = loadedDoc?.id ?? null;

		// Document loaded - sync savedContent and debounced content
		if (loadedId && loadedId !== previousLoadedId) {
			const docContent = loadedDoc!.content;

			savedContent = docContent;
			debouncedContent = docContent;

			// Notify parent
			if (onDocumentLoad && loadedDoc) {
				onDocumentLoad({ name: loadedDoc.name, content: docContent });
			}

			// Collapse frontmatter after content loads
			requestAnimationFrame(() => {
				handleFormat('foldFrontmatter');
			});
		}

		// Document cleared
		if (!loadedId && previousLoadedId) {
			savedContent = '';
			debouncedContent = '';
			autoSave.reset();
		}

		previousLoadedId = loadedId;
	});

	// Handle content changes from editors
	function updateDebouncedContent(newContent: string) {
		// Sync content to the store (single source of truth)
		documentStore.updateLoadedContent(newContent);

		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}

		debounceTimer = window.setTimeout(() => {
			debouncedContent = newContent;
		}, 50);

		// Trigger auto-save (only if document is active)
		if (hasActiveDocument && documentId !== null) {
			autoSave.scheduleSave(documentId, newContent);
		}

		// Notify parent of content change
		if (onContentChange) {
			onContentChange(newContent);
		}
	}

	// Watch for successful auto-save to update savedContent
	$effect(() => {
		const currentStatus = autoSave.saveState.status;

		// Only update savedContent when transitioning TO 'saved' status
		// This prevents the effect from running continuously while status is 'saved'
		if (currentStatus === 'saved' && lastSaveStatus !== 'saved' && isDirty) {
			savedContent = content;
		}

		lastSaveStatus = currentStatus;
	});

	function handleFormat(type: string) {
		// Forward formatting command to the active editor
		if (editorMode === 'rich' && visualEditorRef && typeof visualEditorRef.handleFormat === 'function') {
			visualEditorRef.handleFormat(type);
		} else if (editorRef && typeof editorRef.handleFormat === 'function') {
			editorRef.handleFormat(type);
		}
	}

	function showModal(modal: 'info' | 'import' | 'publish' | 'share') {
		openModal = modal;
	}

	let lastHandledModalCommandToken = 0;
	$effect(() => {
		const command = editorModalCommandsStore.command;
		if (!command || command.token <= lastHandledModalCommandToken) {
			return;
		}

		lastHandledModalCommandToken = command.token;
		if (command.type === 'closeAll') {
			openModal = null;
			return;
		}

		showModal(command.key);
	});

	// Handle file import
	function handleImport(importedContent: string, filename: string) {
		// Check for unsaved changes
		if (isDirty) {
			const confirmed = confirm(
				'You have unsaved changes. Importing will replace your current content. Continue?'
			);
			if (!confirmed) {
				return;
			}
		}

		// Update content via store
		documentStore.updateLoadedContent(importedContent);
		savedContent = importedContent;
		debouncedContent = importedContent;

		// Trigger auto-save
		if (documentId) {
			autoSave.scheduleSave(documentId, importedContent);
		}

		// Notify parent of content change
		if (onContentChange) {
			onContentChange(importedContent);
		}

		toastStore.success(`Imported ${filename}`);
	}

	onMount(async () => {
		responsiveStore.initialize();

		// Ensure quillmark service is ready before enabling derived parsing
		if (!quillmarkService.isReady()) {
			await quillmarkService.initialize();
		}
		quillmarkReady = true;
	});

	// Load and sync editor mode setting
	$effect(() => {
		const savedMode = localStorage.getItem('editor-mode');
		if (savedMode === 'advanced' || savedMode === 'rich') {
			editorMode = savedMode;
		}
	});

	// Listen for editor mode changes from settings
	$effect(() => {
		const handleModeChange = (e: StorageEvent) => {
			if (e.key === 'editor-mode' && e.newValue) {
				if (e.newValue === 'advanced' || e.newValue === 'rich') {
					editorMode = e.newValue;
				}
			}
		};
		window.addEventListener('storage', handleModeChange);
		return () => window.removeEventListener('storage', handleModeChange);
	});

	$effect(() => {
		if (!split.isResizing || typeof document === 'undefined') return;
		const previousUserSelect = document.body.style.userSelect;
		const previousCursor = document.body.style.cursor;
		document.body.style.userSelect = 'none';
		document.body.style.cursor = 'col-resize';

		return () => {
			document.body.style.userSelect = previousUserSelect;
			document.body.style.cursor = previousCursor;
		};
	});

	// Cleanup debounce timer and auto-save
	onDestroy(() => {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}
		autoSave.cancelPendingSave();
	});
</script>

<div
	class="relative flex flex-col flex-1 min-h-0"
	aria-busy={loading}
	aria-disabled={!hasActiveDocument}
>
	<!-- Mobile Tab Switcher (< 768px) - outside dimmed container -->
	{#if isNarrowViewport}
		<div class="mobile-toggle-container">
			<button
				class="mobile-toggle-button {mobileView === 'editor'
					? 'bg-accent text-accent-foreground'
					: 'text-muted-foreground hover:text-foreground/80'}"
				onclick={() => onMobileViewChange?.('editor')}
			>
				Editor
			</button>
			<button
				class="mobile-toggle-button {mobileView === 'preview'
					? 'bg-accent text-accent-foreground'
					: 'text-muted-foreground hover:text-foreground/80'}"
				onclick={() => onMobileViewChange?.('preview')}
			>
				Preview
			</button>
		</div>
	{/if}

	<!-- Content Area -->
	<div class="flex flex-1 min-h-0 overflow-hidden" bind:this={splitContainerElement}>
		<!-- Editor Section (dimmed when loading or no document) -->
		<div
			class="relative flex flex-col min-w-0 min-h-0 transition-opacity duration-300 ease-in-out {loading ||
			!hasActiveDocument
				? 'pointer-events-none opacity-50'
				: ''} {isNarrowViewport && mobileView !== 'editor' ? 'hidden' : ''} {editorPulse ? 'editor-pulse' : ''}"
			style={editorPaneStyle}
		>
			{#if editorMode !== 'rich'}
				<AdvancedToolbar
					onFormat={handleFormat}
				/>
			{/if}
			{#if hasActiveDocument}
			{#if editorMode === 'rich'}
				<!-- VisualEditor keyed by documentId - remounts on document switch -->
				<div class="relative flex flex-col flex-1 min-h-0 {loading ? 'opacity-50 pointer-events-none' : ''}">
					{#if isContentReady}
						{#key documentId}
						<VisualEditor
							bind:this={visualEditorRef}
							document={content}
							quillRef={resolvedQuillRef}
							{cardTypes}
							onDocumentChange={updateDebouncedContent}
							activeCardId={visualEditorActiveCardId}
							onActiveCardIdChange={(id) => visualEditorActiveCardId = id}
							onModeSwitch={() => {
								localStorage.setItem('editor-mode', 'advanced');
								editorMode = 'advanced';
							}}
						/>
						{/key}
					{/if}
					{#if loading}
						<div class="absolute inset-0 flex items-center justify-center bg-background/50">
							<span class="text-muted-foreground">Loading...</span>
						</div>
					{/if}
				</div>
			{:else}
				<MarkdownEditor
					bind:this={editorRef}
					value={content}
					onChange={updateDebouncedContent}
					showLineNumbers={editorMode === 'advanced'}
					id={documentId}
				/>
			{/if}
		{/if}

			<!-- Empty State Overlay (shown when no document) -->
			{#if !hasActiveDocument && !isDocumentsLoading}
				<div
					class="pointer-events-auto absolute inset-0 flex items-center justify-center bg-background/30 backdrop-blur-[1px] transition-opacity duration-300 ease-in-out"
					role="status"
					aria-live="polite"
				>
					<div class="px-4 text-center">
						<p class="mt-2 text-sm text-muted-foreground">
							Select a document from the sidebar or
							{#if onCreateNewDocument}
								<button
									type="button"
									class="text-primary underline hover:text-primary/80"
									onclick={onCreateNewDocument}
									aria-label="Create a new document"
								>
									create a new one
								</button>
							{:else}
								create a new one
							{/if}
						</p>
					</div>
				</div>
			{/if}
		</div>

		{#if !isNarrowViewport}
			<button
				type="button"
				class="panel-resizer"
				class:is-dragging={split.isResizing}
				class:is-hovered={split.isHovered}
				aria-label="Resize editor and preview panels"
				onpointerdown={(e) => split.onPointerDown(e, isNarrowViewport)}
				onpointermove={(e) => split.onPointerMove(e, splitContainerElement)}
				onpointerup={(e) => split.onPointerUp(e)}
				onpointercancel={(e) => split.onPointerCancel(e)}
				onpointerenter={() => split.onPointerEnter()}
				onpointerleave={() => split.onPointerLeave()}
			>
				<div class="panel-resizer__line" aria-hidden="true"></div>
				<span class="panel-resizer__icon" aria-hidden="true">
					<EllipsisVertical class="h-3 w-3" />
				</span>
			</button>
		{/if}

		<!-- Preview Section (Desktop: always visible, Mobile: toggled) - not dimmed -->
		<div
			class="relative min-w-0 flex-1 overflow-auto {isNarrowViewport
				? mobileView === 'preview'
					? ''
					: 'hidden'
				: ''}"
			style={previewPaneStyle}
		>
			{#if hasActiveDocument}
				{#if documentId && documentStore.activeDocument?.published_as}
					<TemplateDivergenceBanner {documentId} documentContentHash={documentStore.activeDocument?.content_hash ?? null} />
				{/if}
				<Preview markdown={debouncedContent} quillName={parsedQuillName} onPreviewStatusChange={handlePreviewStatusChange} onPreviewClick={handlePreviewClick} />
			{/if}

			<!-- Modals (scoped to preview pane, not affected by editor dimming) -->
			<!-- Document Stats Dialog -->
			<DocumentInfoDialog
				open={openModal === 'info'}
				onOpenChange={(open) => (openModal = open ? 'info' : null)}
				document={documentStore.activeDocument}
				{content}
			/>

			<ImportFileDialog
				open={openModal === 'import'}
				onOpenChange={(open) => (openModal = open ? 'import' : null)}
				onImport={handleImport}
			/>

			<TemplatePublishModal
				open={openModal === 'publish'}
				onOpenChange={(open) => (openModal = open ? 'publish' : null)}
				documentId={documentId ?? ''}
				documentName={documentStore.activeDocument?.name ?? ''}
				documentContent={debouncedContent}
				isPublishedTemplate={documentStore.activeDocument?.published_as != null}
			/>

			<ShareModal
				open={openModal === 'share'}
				onOpenChange={(open) => (openModal = open ? 'share' : null)}
				document={documentStore.activeDocument}
			/>
		</div>
	</div>
</div>

<style>
	/* Mobile toggle container - matches SidebarButtonSlot height (48px) */
	.mobile-toggle-container {
		display: flex;
		height: var(--mobile-toggle-height);
		min-height: var(--mobile-toggle-height);
		max-height: var(--mobile-toggle-height);
		border-bottom: var(--layout-border-width) solid var(--color-border);
		background-color: var(--color-surface-elevated);
		flex-shrink: 0;
		overflow: hidden; /* Prevent content from expanding container */
	}

	/* Mobile toggle button - fills container height */
	.mobile-toggle-button {
		flex: 1;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 1rem; /* 16px horizontal padding */
		margin: 0;
		border: none;
		font-family: inherit;
		font-size: 0.875rem; /* text-sm */
		font-weight: 500; /* font-medium */
		line-height: 1; /* Prevent text from adding extra height */
		box-sizing: border-box; /* Ensure padding doesn't add to height */
		transition:
			background-color 0.2s,
			color 0.2s;
		cursor: pointer;
	}

	.panel-resizer {
		flex: 0 0 0.6rem;
		width: 0.6rem;
		display: flex;
		position: relative;
		align-items: center;
		justify-content: center;
		cursor: col-resize;
		touch-action: none;
		outline: none;
	}

	.panel-resizer__line {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		width: 3px;
		height: 100%;
		border-radius: 10px;
		background-color: var(--color-border);
		transition: background-color 0.15s ease;
	}

	.panel-resizer__icon {
		position: relative;
		z-index: 1;
		height: 0.875rem;
		width: 0.875rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--color-border);
		pointer-events: none;
	}

	.panel-resizer.is-hovered .panel-resizer__line,
	.panel-resizer:focus-visible .panel-resizer__line,
	.panel-resizer.is-dragging .panel-resizer__line {
		background-color: var(--color-border-hover);
		width: 5.5px;
	}

	.panel-resizer.is-hovered .panel-resizer__icon,
	.panel-resizer:focus-visible .panel-resizer__icon,
	.panel-resizer.is-dragging .panel-resizer__icon {
		color: var(--color-foreground);
	}
</style>
