/**
 * Document store for managing document list and active document
 * Supports multiple document sources (cloud and local) for authenticated users
 * Uses DocumentClient for all I/O operations
 * Uses CollectionStore factory for base state management
 */

import type { DocumentListItem, DocumentMetadata } from '$lib/services/documents/types';
import type { DocumentClient } from '$lib/services/documents/document-client';
import {
	DocumentRepository,
	type DocumentSource
} from '$lib/services/documents/document-repository';
import { importTemplate as importTemplateRequest } from '$lib/services/templates/library-client';
import { generateUniqueName, DEFAULT_DOCUMENT_NAME } from '$lib/utils/document-naming';
import { getErrorMessage } from '$lib/errors';
import { SessionExpiredError } from '$lib/errors/session-expired-error';
import { createCollectionStore, createSimpleState } from './factories.svelte';
import { browser } from '$app/environment';
import { userStore } from './user.svelte';
import {
	runClientDocumentRepairs,
	type ClientDocumentRepairId
} from '$lib/parsing/document-repairs';
import { quillmarkService } from '$lib/services/quillmark/service';

/** Collapsible section identifiers for the document list UI */
export type DocumentSection = 'private' | 'public' | 'local' | 'templates';

/** Extended document list item with source tracking */
export interface SourcedDocumentMetadata extends DocumentListItem {
	source: DocumentSource;
}

const COLLAPSE_STATE_KEY = 'tonguetoquill_group_collapse_state';
const LAST_ACTIVE_DOC_KEY = 'tonguetoquill_last_active_document';

class DocumentStore {
	private repository = new DocumentRepository(() => ({
		isGuest: this.isGuest,
		userId: this.userId
	}));

	// Cloud documents (from API for authenticated users)
	private cloudCollection = createCollectionStore<DocumentListItem>({
		idKey: 'id',
		withLoading: true,
		withError: true,
		withActiveSelection: false // We manage active selection ourselves
	});

	// Local documents (from localStorage, available in both guest and authenticated modes)
	// Stored as DocumentListItem so getters can read `published_as`; guests have it as null.
	private localCollection = createCollectionStore<DocumentListItem>({
		idKey: 'id',
		withLoading: false,
		withError: false,
		withActiveSelection: false
	});

	// Active document selection tracking
	private _activeDocumentId = $state<string | null>(null);
	private _activeSource = $state<DocumentSource | null>(null);
	private _isLoading = $state<boolean>(true);
	private _error = $state<string | null>(null);

	// Loaded document content - single source of truth for editor
	private _loadedDocument = $state<{ id: string; content: string; name: string } | null>(null);
	private _isLoadingContent = $state<boolean>(false);

	// Initialization state tracking (for SSR optimization)
	private cloudInitialized = false;
	private localInitialized = false;

	// Group collapse state persistence
	private collapseState = createSimpleState<Record<string, boolean>>({
		initialValue: {},
		persistKey: COLLAPSE_STATE_KEY
	});

	// Last active document persistence (for session restoration)
	private lastActiveDocumentId = createSimpleState<string | null>({
		initialValue: null,
		persistKey: LAST_ACTIVE_DOC_KEY
	});

	// =========================================================================
	// Core Getters
	// =========================================================================

	/** Cloud documents from API (user's own) */
	get cloudDocuments(): DocumentListItem[] {
		return this.cloudCollection.items;
	}

	/** Public cloud documents */
	get publicDocuments(): DocumentListItem[] {
		return this.cloudCollection.items.filter((d) => d.is_public);
	}

	/** Template cloud documents */
	get templateDocuments(): DocumentListItem[] {
		return this.cloudCollection.items.filter((d) => d.published_as !== null);
	}

	/** Private cloud documents (excluding templates) */
	get privateCloudDocuments(): DocumentListItem[] {
		return this.cloudCollection.items.filter((d) => !d.is_public && d.published_as === null);
	}

	/** Local documents from localStorage */
	get localDocuments(): DocumentListItem[] {
		return this.localCollection.items;
	}

	/**
	 * All documents combined (cloud first, then local)
	 * For backwards compatibility with existing flat list usage
	 */
	get documents(): DocumentListItem[] {
		return [...this.cloudCollection.items, ...this.localCollection.items];
	}

	/** Currently active document ID */
	get activeDocumentId(): string | null {
		return this._activeDocumentId;
	}

	/** Source of the currently active document */
	get activeSource(): DocumentSource | null {
		return this._activeSource;
	}

	/** Whether loading is in progress */
	get isLoading(): boolean {
		return this._isLoading;
	}

	/** Current error message, if any */
	get error(): string | null {
		return this._error;
	}

	/** Currently active document list item */
	get activeDocument(): DocumentListItem | null {
		if (!this._activeDocumentId) return null;

		if (this._activeSource === 'cloud') {
			return this.cloudDocuments.find((d) => d.id === this._activeDocumentId) ?? null;
		} else if (this._activeSource === 'local') {
			return this.localDocuments.find((d) => d.id === this._activeDocumentId) ?? null;
		}
		// If source unknown, search both
		return this.documents.find((d) => d.id === this._activeDocumentId) ?? null;
	}

	/** Whether user is in guest mode (derived from userStore) */
	get isGuest(): boolean {
		return !userStore.isAuthenticated;
	}

	/** Current user ID (derived from userStore) */
	get userId(): string {
		return userStore.userId ?? 'guest';
	}

	/** Whether local documents exist */
	get hasLocalDocuments(): boolean {
		return this.localCollection.items.length > 0;
	}

	/**
	 * Whether groups should be displayed in sidebar
	 * True when authenticated AND (has local documents OR has public documents)
	 * Guests see local documents as standard docs (no grouping/badges)
	 */
	get shouldShowGroups(): boolean {
		return userStore.isAuthenticated && (this.hasLocalDocuments || this.publicDocuments.length > 0);
	}

	/** Currently loaded document content (single source of truth for editors) */
	get loadedDocument(): { id: string; content: string; name: string } | null {
		return this._loadedDocument;
	}

	/** Whether document content is currently being loaded */
	get isLoadingContent(): boolean {
		return this._isLoadingContent;
	}

	// =========================================================================
	// Client Access
	// =========================================================================

	/** Provide access to appropriate document client for AutoSave */
	getDocumentClient(): DocumentClient {
		return this.repository.getActiveClient(this._activeSource);
	}

	// =========================================================================
	// State Setters
	// =========================================================================

	setActiveDocumentId(id: string | null, source?: DocumentSource) {
		this._activeDocumentId = id;

		if (id === null) {
			this._activeSource = null;
		} else if (source) {
			this._activeSource = source;
		} else {
			// Determine source from ID by checking collections
			this._activeSource = this.repository.resolveSourceById(
				id,
				this.cloudDocuments,
				this.localDocuments
			);
		}

		// Persist for session restoration (skip null and optimistic temp IDs)
		if (id !== null && !id.startsWith('temp-')) {
			this.lastActiveDocumentId.set(id);
		}
	}

	private setLoading(isLoading: boolean) {
		this._isLoading = isLoading;
	}

	private setError(error: string | null) {
		this._error = error;
	}

	/**
	 * Unified error handler for document operations.
	 * If the error is a SessionExpiredError, triggers session-expired modal.
	 * Otherwise, sets a user-facing error message.
	 * Always re-throws so callers can rollback optimistic updates.
	 */
	private handleOperationError(err: unknown, fallbackMessage: string): never {
		if (err instanceof SessionExpiredError) {
			userStore.markSessionExpired();
		} else {
			this.setError(getErrorMessage(err, fallbackMessage));
		}
		throw err;
	}

	// =========================================================================
	// Document Selection & Loading
	// =========================================================================

	/**
	 * Select a document and load its content.
	 * This is the main method for document switching - combines ID selection + content loading.
	 */
	async selectDocument(id: string): Promise<void> {
		// No-op if the document is already loaded
		if (id === this._activeDocumentId && this._loadedDocument?.id === id) return;

		// Auto-save previous document if it has unsaved changes
		if (
			this._hasUnsavedChanges &&
			this._activeDocumentId &&
			this._loadedDocument &&
			this._activeDocumentId !== id
		) {
			const prevId = this._activeDocumentId;
			const prevContent = this._loadedDocument.content;

			// Fire-and-forget save to ensure UI remains snappy
			this.saveDocument(prevId, prevContent).catch((err) =>
				console.error('Failed to auto-save on document switch:', err)
			);

			// Reset dirty flag since we initiated save
			this._hasUnsavedChanges = false;
		}

		// Update active ID immediately (for sidebar highlighting)
		this.setActiveDocumentId(id);

		// Handle temp documents (newly created, not yet persisted)
		if (id.startsWith('temp-')) {
			const metadata = this.activeDocument;
			this._loadedDocument = {
				id,
				content: '',
				name: metadata?.name ?? 'Untitled'
			};
			this._isLoadingContent = false;
			return;
		}

		// Clear stale content and start loading
		this._loadedDocument = null;
		this._isLoadingContent = true;

		try {
			const doc = await this.fetchDocument(id);

			// Only update if this is still the active document (handle race conditions)
			if (this._activeDocumentId === id) {
				let repairedContent = doc.content;
				let applied: ClientDocumentRepairId[] = [];

				if (browser) {
					try {
						if (!quillmarkService.isReady()) {
							await quillmarkService.initialize();
						}
						const datePaths = await quillmarkService.getDatePathConfigForMarkdown(repairedContent);
						if (datePaths) {
							const result = runClientDocumentRepairs(repairedContent, quillmarkService.Document, {
								// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient input, not held in $state
								now: new Date(),
								datePaths
							});
							repairedContent = result.document;
							applied = result.applied;
						}
					} catch (err) {
						console.warn(
							'[TongueToQuill] Skipping document repairs (quill/schema unavailable)',
							err
						);
					}
				}

				this._loadedDocument = { id, content: repairedContent, name: doc.name };

				if (browser && applied.length > 0) {
					console.log(`[TongueToQuill] Applied document repairs: ${applied.join(', ')}`);
					this.saveDocument(id, repairedContent).catch((err) =>
						console.error('[TongueToQuill] Failed to persist document repairs', err)
					);
				}
			}
		} catch (err) {
			this.setError(getErrorMessage(err, 'Failed to load document'));
			throw err;
		} finally {
			this._isLoadingContent = false;
		}
	}

	/**
	 * Update the loaded document content (for auto-save sync).
	 * Call this after edits to keep store in sync.
	 */
	updateLoadedContent(content: string): void {
		if (this._loadedDocument) {
			this._loadedDocument = { ...this._loadedDocument, content };
		}
	}

	/**
	 * Clear loaded document (for cleanup when no document selected).
	 */
	clearLoadedDocument(): void {
		this._loadedDocument = null;
	}

	// =========================================================================
	// Group Collapse State
	// =========================================================================

	/** Toggle collapse state for a document section and persist */
	toggleGroupCollapse(section: DocumentSection) {
		this.collapseState.update((state) => ({
			...state,
			[section]: !state[section]
		}));
	}

	/** Check if a document section is collapsed */
	isGroupCollapsed(section: DocumentSection, isFirst = false): boolean {
		if (isFirst) return this.collapseState.value[section] ?? false;
		const defaultCollapsed = section === 'local';
		return this.collapseState.value[section] ?? defaultCollapsed;
	}

	/** Expand a document section (set collapsed to false) and persist */
	expandGroup(section: DocumentSection) {
		this.collapseState.update((state) => ({
			...state,
			[section]: false
		}));
	}

	// =========================================================================
	// Collection Mutations
	// =========================================================================

	private addDocument(document: DocumentListItem, source: DocumentSource) {
		if (source === 'cloud') {
			this.cloudCollection.add(document);
		} else {
			this.localCollection.add(document);
		}
	}

	async updateDocument(id: string, updates: Partial<DocumentMetadata>) {
		// Determine source from the ID
		const isCloud = this.cloudDocuments.some((d) => d.id === id);
		const isLocal = this.localDocuments.some((d) => d.id === id);

		if (!isCloud && !isLocal) {
			throw new Error('Document not found');
		}

		const source: DocumentSource = isCloud ? 'cloud' : 'local';
		const collection = isCloud ? this.cloudCollection : this.localCollection;
		const client = this.repository.getClientForSource(source);

		const documentToUpdate = this.documents.find((doc) => doc.id === id);
		if (!documentToUpdate) {
			throw new Error('Document not found');
		}

		// Determine if this update requires persistence (i.e., has `name` update)
		const requiresPersistence = updates.name !== undefined;

		if (!requiresPersistence) {
			// For metadata-only updates (e.g., content_size_bytes, updated_at from auto-save),
			// just update local state without calling DocumentClient
			collection.update(id, updates);
			return;
		}

		// Extract name from updates for DocumentClient
		const clientUpdates: { name?: string } = {};
		if (updates.name !== undefined) {
			clientUpdates.name = updates.name;
		}

		// Helper function to merge server response with updates
		const mergeWithServerResponse = (
			doc: DocumentListItem,
			result: { content_size_bytes?: number; updated_at?: string; content_hash?: string | null }
		) => ({
			...doc,
			...updates,
			...(result.content_size_bytes !== undefined && {
				content_size_bytes: result.content_size_bytes
			}),
			...(result.updated_at !== undefined && { updated_at: result.updated_at }),
			...(result.content_hash !== undefined && { content_hash: result.content_hash })
		});

		// Use optimistic update for immediate UI responsiveness
		const previousDocument = { ...documentToUpdate };

		// Optimistically update local state
		collection.update(id, updates);

		try {
			// Call DocumentClient to persist
			const result = await client.updateDocument(id, clientUpdates);

			// Merge server response with current state
			const currentDoc = this.documents.find((doc) => doc.id === id);
			if (currentDoc) {
				const merged = mergeWithServerResponse(currentDoc, result);
				const toUpdate: Partial<DocumentMetadata> = {
					content_size_bytes: merged.content_size_bytes,
					updated_at: merged.updated_at
				};
				if (result.content_hash !== undefined) {
					toUpdate.content_hash = result.content_hash;
				}
				collection.update(id, toUpdate);
			}
		} catch (err) {
			// Rollback on error
			collection.update(id, previousDocument);
			this.handleOperationError(err, 'Failed to update document');
		}
	}

	private removeDocument(id: string, source: DocumentSource) {
		const collection = source === 'cloud' ? this.cloudCollection : this.localCollection;
		collection.remove(id);

		// If removing active document, clear loaded content and select next available
		if (this._activeDocumentId === id) {
			this._activeDocumentId = null;
			this._activeSource = null;
			this._loadedDocument = null;
			this.autoSelectDocument();
		}
	}

	/**
	 * Auto-select a document and load its content.
	 * Restores the last active document from session storage if available.
	 * Falls back to the first available document if the persisted document
	 * no longer exists (e.g., deleted in another session).
	 */
	private autoSelectDocument() {
		if (this._activeDocumentId !== null) return;

		// Try to restore last active document from session storage
		const lastActiveId = this.lastActiveDocumentId.value;
		if (lastActiveId) {
			const existsInDocuments = this.documents.some((d) => d.id === lastActiveId);
			if (existsInDocuments) {
				this.selectDocument(lastActiveId);
				return;
			}

			// If the persisted doc isn't found but not all sources are loaded yet,
			// defer selection until remaining sources finish loading
			const allInitialized = this.isGuest
				? this.localInitialized
				: this.cloudInitialized && this.localInitialized;
			if (!allInitialized) return;
		}

		// Fall back to first available document: Your Docs (private cloud) → local → empty
		if (this.privateCloudDocuments.length > 0) {
			this.selectDocument(this.privateCloudDocuments[0].id);
		} else if (this.localDocuments.length > 0) {
			this.selectDocument(this.localDocuments[0].id);
		}
	}

	// =========================================================================
	// API Methods - Document Initialization
	// =========================================================================

	/**
	 * Initialize cloud documents from SSR data
	 * Called from +page.svelte with data from +page.server.ts
	 * Idempotent - can be called multiple times with fresh SSR data (e.g., on page refresh)
	 * Only for authenticated users - fail fast if misused
	 */
	initializeCloudDocuments(documents: DocumentListItem[]): void {
		if (this.isGuest) {
			throw new Error('Cannot initialize cloud documents in guest mode');
		}

		// Update with fresh SSR data (idempotent on page refresh/navigation)
		this.cloudCollection.setItems(documents);
		this.cloudInitialized = true;
		this.autoSelectDocument();
	}

	/**
	 * Fetch local documents from localStorage
	 * Called client-side for both guest and authenticated users
	 * - Guest mode: primary document source
	 * - Authenticated mode: supplemental (from previous guest sessions)
	 */
	async fetchLocalDocuments(): Promise<void> {
		this.setLoading(true);
		this.setError(null);

		try {
			const localClient = this.repository.getClientForSource('local');
			const localDocs = await localClient.listDocuments();
			this.localCollection.setItems(localDocs);
		} catch (err) {
			this.setError(getErrorMessage(err, 'Failed to fetch local documents'));
			throw err;
		} finally {
			// Mark as initialized even on failure so autoSelectDocument can fall back
			// instead of waiting indefinitely for local docs
			this.localInitialized = true;
			this.autoSelectDocument();
			this.setLoading(false);
		}
	}

	/**
	 * Fetch documents for guest mode
	 * Only fetches from localStorage - fail fast if called for authenticated users
	 */
	async fetchGuestDocuments(): Promise<void> {
		if (!this.isGuest) {
			throw new Error('Use initializeCloudDocuments() for authenticated users');
		}

		// Clear cloud collection for guests
		this.cloudCollection.setItems([]);
		this.cloudInitialized = false;

		// Fetch local documents
		await this.fetchLocalDocuments();
	}

	async fetchDocument(id: string): Promise<{ id: string; content: string; name: string }> {
		try {
			// Determine source from ID
			const source = this.repository.resolveSourceById(
				id,
				this.cloudDocuments,
				this.localDocuments
			);
			const client = this.repository.getClientForSource(source ?? 'local');
			return await client.getDocument(id);
		} catch (err) {
			this.setError(getErrorMessage(err, 'Failed to fetch document'));
			throw err;
		}
	}

	async createDocument(
		name: string = DEFAULT_DOCUMENT_NAME,
		content: string = '',
		sourceTemplateId?: string
	) {
		// Determine which source to create in based on auth state
		const { source, client } = this.repository.getClientForNewDocument();
		const collection = source === 'cloud' ? this.cloudCollection : this.localCollection;

		// Use optimistic update for immediate UI responsiveness
		const tempId = `temp-${Date.now()}`;
		const tempDoc: DocumentListItem = {
			id: tempId,
			owner_id: 'temp',
			name,
			content_size_bytes: 0,
			is_public: false,
			content_hash: null,
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- ISO timestamp string, not held in $state
			created_at: new Date().toISOString(),
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- ISO timestamp string, not held in $state
			updated_at: new Date().toISOString(),
			published_as: null
		};

		collection.add(tempDoc);

		// Expand the section where the new document will appear
		const section: DocumentSection = source === 'local' ? 'local' : 'private';
		this.expandGroup(section);

		const previousActiveId = this._activeDocumentId;
		const previousActiveSource = this._activeSource;
		const previousLoadedDoc = this._loadedDocument;
		// Use selectDocument to both select AND set loaded content (handles temp- prefix)
		this.selectDocument(tempId);

		try {
			let metadata: DocumentListItem;
			let persistedContent = content;
			if (sourceTemplateId && source === 'cloud') {
				// Authed template creation goes through /api/templates/[id]/import so
				// the server is the single source of truth for content + provenance
				// (template_import_events, template_user_recents, importCount).
				const doc = await importTemplateRequest(sourceTemplateId, name);
				persistedContent = doc.content;
				metadata = {
					id: doc.id,
					owner_id: doc.owner_id,
					name: doc.name,
					content_size_bytes: doc.content_size_bytes,
					is_public: doc.is_public,
					content_hash: doc.content_hash,
					created_at: doc.created_at,
					updated_at: doc.updated_at,
					published_as: null
				};
			} else {
				metadata = await client.createDocument(name, content);
			}
			collection.remove(tempId);
			collection.add(metadata);
			this._loadedDocument = {
				id: metadata.id,
				content: persistedContent,
				name: metadata.name
			};
			this.setActiveDocumentId(metadata.id, source);

			return metadata;
		} catch (err) {
			// Rollback on error
			collection.remove(tempId);
			this.setActiveDocumentId(previousActiveId, previousActiveSource ?? undefined);
			this._loadedDocument = previousLoadedDoc;
			this.handleOperationError(err, 'Failed to create document');
		}
	}

	async deleteDocument(id: string) {
		// Determine source from ID
		const isCloud = this.cloudDocuments.some((d) => d.id === id);
		const source: DocumentSource = isCloud ? 'cloud' : 'local';
		const client = this.repository.getClientForSource(source);
		const documentToDelete = this.documents.find((doc) => doc.id === id);

		if (!documentToDelete) {
			throw new Error('Document not found');
		}

		// Optimistic removal
		this.removeDocument(id, source);

		try {
			await client.deleteDocument(id);
		} catch (err) {
			// Rollback on error
			this.addDocument(documentToDelete, source);
			this.handleOperationError(err, 'Failed to delete document');
		}
	}

	/**
	 * Remove a document from the local store state only.
	 * Used when the document has already been deleted on the server (e.g., during unpublish).
	 */
	removeDocumentLocally(id: string) {
		const source =
			this.repository.resolveSourceById(id, this.cloudDocuments, this.localDocuments) ?? 'local';
		this.removeDocument(id, source);
	}

	/**
	 * Set document public status with optimistic update and rollback on error
	 * Only applicable to cloud documents
	 */
	async setPublic(id: string, isPublic: boolean) {
		const doc = this.cloudDocuments.find((d) => d.id === id);
		if (!doc) {
			throw new Error('Document not found or is a local document');
		}

		// Store previous value for rollback
		const previousIsPublic = doc.is_public;

		// Optimistic update
		this.cloudCollection.update(id, { is_public: isPublic });

		try {
			// Persist change via API
			const cloudClient = this.repository.getClientForSource('cloud');
			const result = await cloudClient.setPublic(id, isPublic);

			// Update with server response
			this.cloudCollection.update(id, {
				is_public: result.is_public,
				updated_at: result.updated_at
			});
		} catch (err) {
			// Rollback on error
			this.cloudCollection.update(id, { is_public: previousIsPublic });
			this.handleOperationError(err, 'Failed to update sharing status');
		}
	}

	// =========================================================================
	// Duplicate Document
	// =========================================================================

	/**
	 * Duplicate a document by fetching its content and creating a new copy.
	 * Auto-selects the new copy and uses "(Copy)" / "(Copy N)" naming.
	 */
	async duplicateDocument(id: string): Promise<DocumentListItem | undefined> {
		const fullDoc = await this.fetchDocument(id);
		const finalName = generateUniqueName(
			fullDoc.name,
			this.documents.map((d) => d.name)
		);
		return this.createDocument(finalName, fullDoc.content);
	}

	// =========================================================================
	// Promote Local Document to Cloud
	// =========================================================================

	/**
	 * Promote a local document to cloud storage
	 * Uploads the document to the API and removes it from localStorage
	 */
	async promoteLocalDocument(localId: string): Promise<DocumentListItem> {
		if (this.isGuest) {
			throw new Error('Sign in to save documents to your account');
		}

		// Find the local document
		const localDoc = this.localDocuments.find((d) => d.id === localId);
		if (!localDoc) {
			throw new Error('Local document not found');
		}

		// Get full document content from localStorage
		const localClient = this.repository.getClientForSource('local');
		const fullDoc = await localClient.getDocument(localId);

		// Resolve name against cloud documents; returns bare name when no collision
		const finalName = generateUniqueName(
			fullDoc.name,
			this.cloudDocuments.map((d) => d.name)
		);

		// Track if this was the active document
		const wasActive = this._activeDocumentId === localId;

		try {
			// Create document in cloud
			const cloudClient = this.repository.getClientForSource('cloud');
			const cloudDoc = await cloudClient.createDocument(finalName, fullDoc.content);

			// Add to cloud collection
			this.cloudCollection.add(cloudDoc);

			// Remove from local collection and localStorage
			this.localCollection.remove(localId);
			await localClient.deleteDocument(localId);

			// If promoted doc was active, switch to the new cloud doc
			if (wasActive) {
				this.setActiveDocumentId(cloudDoc.id, 'cloud');
			}

			return cloudDoc;
		} catch (err) {
			// Don't remove from local if cloud create failed
			this.handleOperationError(err, 'Failed to save document to account');
		}
	}

	// =========================================================================
	// Document Saving
	// =========================================================================

	/**
	 * Save document content by ID
	 * Handles determining the correct source and client
	 */
	async saveDocument(id: string, content: string): Promise<void> {
		// Determine source from the ID
		const isCloud = this.cloudDocuments.some((d) => d.id === id);
		const isLocal = this.localDocuments.some((d) => d.id === id);

		if (!isCloud && !isLocal) {
			// If not found in either collection, it might be a temporary document specific to a client
			// But for auto-save safety we should probably error or ignore
			throw new Error('Document not found');
		}

		const client = this.repository.getClientForSource(isCloud ? 'cloud' : 'local');
		const collection = isCloud ? this.cloudCollection : this.localCollection;

		try {
			// Call client to update
			const result = await client.updateDocument(id, { content });

			// Update metadata in store
			const updates: Partial<DocumentMetadata> = {};
			if (result.content_size_bytes !== undefined) {
				updates.content_size_bytes = result.content_size_bytes;
			}
			if (result.updated_at !== undefined) {
				updates.updated_at = result.updated_at;
			}
			if (result.content_hash !== undefined) {
				updates.content_hash = result.content_hash;
			}

			if (Object.keys(updates).length > 0) {
				collection.update(id, updates);
			}
		} catch (err) {
			this.handleOperationError(err, 'Failed to save document');
		}
	}

	// =========================================================================
	// Unsaved Changes Tracking
	// =========================================================================

	private _hasUnsavedChanges = $state(false);

	get hasUnsavedChanges(): boolean {
		return this._hasUnsavedChanges;
	}

	setHasUnsavedChanges(value: boolean) {
		this._hasUnsavedChanges = value;
	}
}

export { DocumentStore, LAST_ACTIVE_DOC_KEY };
export const documentStore = new DocumentStore();
