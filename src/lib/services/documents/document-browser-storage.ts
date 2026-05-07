/**
 * Browser Storage Document Service for Guest Users
 * Provides document storage using browser LocalStorage for guest mode
 * Implements DocumentServiceContract for compatibility with other storage services
 */

import type {
	CreateDocumentParams,
	Document,
	DocumentListItem,
	DocumentListResult,
	DocumentMetadata,
	DocumentReferenceParams,
	DocumentServiceContract,
	ListDocumentsParams,
	PublicDocument,
	UpdateContentParams,
	UpdateDocumentParams,
	UpdateNameParams,
	UpdatePublicParams,
	UUID
} from './types';
import { DocumentValidator } from './document-validator';
import { DEFAULT_DOCUMENT_NAME } from '$lib/utils/document-naming';

const STORAGE_KEY = 'tonguetoquill_guest_documents';
const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB limit

interface StoredDocument {
	id: string;
	name: string;
	content: string;
	content_size_bytes: number;
	created_at: string;
	updated_at: string;
}

class DocumentBrowserStorage implements DocumentServiceContract {
	private getDocuments(): StoredDocument[] {
		try {
			const data = localStorage.getItem(STORAGE_KEY);
			return data ? JSON.parse(data) : [];
		} catch {
			return [];
		}
	}

	private saveDocuments(documents: StoredDocument[]): void {
		try {
			const data = JSON.stringify(documents);
			// Check storage size
			if (data.length > MAX_STORAGE_SIZE) {
				throw new Error('Storage quota exceeded (5MB limit)');
			}
			localStorage.setItem(STORAGE_KEY, data);
		} catch (err) {
			if (err instanceof Error) {
				throw new Error(`Failed to save to LocalStorage: ${err.message}`);
			}
			throw err;
		}
	}

	async createDocument(params: CreateDocumentParams): Promise<Document> {
		// Extract params (owner_id ignored, always 'guest' for browser storage)
		const { name, content } = params;

		// Validate inputs
		const trimmedName = name.trim() || DEFAULT_DOCUMENT_NAME;
		DocumentValidator.validateName(trimmedName);
		DocumentValidator.validateContent(content);

		const documents = this.getDocuments();

		const newDoc: StoredDocument = {
			id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			name: trimmedName,
			content,
			content_size_bytes: DocumentValidator.getByteLength(content),
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		documents.unshift(newDoc);
		this.saveDocuments(documents);

		// Return complete Document with owner_id and is_public (always false for guests)
		return {
			...newDoc,
			owner_id: 'guest',
			is_public: false,
			content_hash: null
		};
	}

	async getDocumentMetadata(params: DocumentReferenceParams): Promise<DocumentMetadata> {
		// Extract params (user_id ignored for browser storage)
		const { document_id } = params;

		const documents = this.getDocuments();
		const doc = documents.find((d) => d.id === document_id);

		if (!doc) {
			throw new Error('Document not found');
		}

		const { content: _, ...metadata } = doc;
		return {
			...metadata,
			owner_id: 'guest',
			is_public: false,
			content_hash: null
		};
	}

	async getDocumentContent(params: DocumentReferenceParams): Promise<Document> {
		// Extract params (user_id ignored for browser storage)
		const { document_id } = params;

		const documents = this.getDocuments();
		const doc = documents.find((d) => d.id === document_id);

		if (!doc) {
			throw new Error('Document not found');
		}

		// Return complete Document with owner_id and is_public (always false for guests)
		return { ...doc, owner_id: 'guest', is_public: false, content_hash: null };
	}

	async updateDocument(params: UpdateDocumentParams): Promise<Document> {
		const { document_id, content, name, is_public } = params;

		if (is_public !== undefined) {
			throw new Error('Sign in to share documents');
		}
		if (content !== undefined) {
			DocumentValidator.validateContent(content);
		}
		if (name !== undefined) {
			const trimmedName = name.trim() || DEFAULT_DOCUMENT_NAME;
			DocumentValidator.validateName(trimmedName);
		}

		const documents = this.getDocuments();
		const index = documents.findIndex((d) => d.id === document_id);

		if (index === -1) {
			throw new Error('Document not found');
		}

		if (content !== undefined) {
			documents[index].content = content;
			documents[index].content_size_bytes = DocumentValidator.getByteLength(content);
		}
		if (name !== undefined) {
			documents[index].name = name.trim() || DEFAULT_DOCUMENT_NAME;
		}
		documents[index].updated_at = new Date().toISOString();

		this.saveDocuments(documents);

		return {
			...documents[index],
			owner_id: 'guest',
			is_public: false,
			content_hash: null
		};
	}

	async updateDocumentContent(params: UpdateContentParams): Promise<Document> {
		// Extract params (user_id ignored for browser storage)
		const { document_id, content } = params;

		// Validate content
		DocumentValidator.validateContent(content);

		const documents = this.getDocuments();
		const index = documents.findIndex((d) => d.id === document_id);

		if (index === -1) {
			throw new Error('Document not found');
		}

		documents[index].content = content;
		documents[index].content_size_bytes = DocumentValidator.getByteLength(content);
		documents[index].updated_at = new Date().toISOString();

		this.saveDocuments(documents);

		// Return updated document with is_public (always false for guests)
		return {
			...documents[index],
			owner_id: 'guest',
			is_public: false,
			content_hash: null
		};
	}

	async updateDocumentName(params: UpdateNameParams): Promise<DocumentMetadata> {
		// Extract params (user_id ignored for browser storage)
		const { document_id, name } = params;

		// Validate name
		const trimmedName = name.trim() || DEFAULT_DOCUMENT_NAME;
		DocumentValidator.validateName(trimmedName);

		const documents = this.getDocuments();
		const index = documents.findIndex((d) => d.id === document_id);

		if (index === -1) {
			throw new Error('Document not found');
		}

		documents[index].name = trimmedName;
		documents[index].updated_at = new Date().toISOString();

		this.saveDocuments(documents);

		// Return metadata (without content) with is_public (always false for guests)
		const { content: _, ...metadata } = documents[index];
		return {
			...metadata,
			owner_id: 'guest',
			is_public: false,
			content_hash: null
		};
	}

	async updateDocumentPublic(_params: UpdatePublicParams): Promise<DocumentMetadata> {
		// Guest users cannot share documents
		throw new Error('Sign in to share documents');
	}

	async getPublicDocument(_documentId: UUID): Promise<PublicDocument | null> {
		// Guest documents cannot be public, so this always returns null
		return null;
	}

	async deleteDocument(params: DocumentReferenceParams): Promise<void> {
		// Extract params (user_id ignored for browser storage)
		const { document_id } = params;

		const documents = this.getDocuments();
		const filtered = documents.filter((d) => d.id !== document_id);

		if (filtered.length === documents.length) {
			throw new Error('Document not found');
		}

		this.saveDocuments(filtered);
	}

	async listUserDocuments(params: ListDocumentsParams): Promise<DocumentListResult> {
		// Extract params (user_id ignored for browser storage)
		const { limit = 50, offset = 0 } = params;

		const documents = this.getDocuments();

		// Sort by created_at descending (newest first) to match API behavior
		documents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

		// Apply pagination
		const total = documents.length;
		const paginatedDocuments = documents.slice(offset, offset + limit);

		// Guest documents never have a published template; published_as is always null.
		const items: DocumentListItem[] = paginatedDocuments.map(({ content: _, ...meta }) => ({
			...meta,
			owner_id: 'guest',
			is_public: false,
			content_hash: null as string | null,
			published_as: null
		}));

		return {
			documents: items,
			total,
			limit,
			offset
		};
	}

	// Helper method to get all documents for migration
	getAllDocumentsWithContent(): StoredDocument[] {
		return this.getDocuments();
	}

	// Clear all guest documents
	clear(): void {
		localStorage.removeItem(STORAGE_KEY);
	}

	// Get storage usage
	getStorageInfo(): { used: number; max: number; percentUsed: number } {
		const data = localStorage.getItem(STORAGE_KEY) || '';
		const used = data.length;
		const percentUsed = (used / MAX_STORAGE_SIZE) * 100;

		return {
			used,
			max: MAX_STORAGE_SIZE,
			percentUsed: Math.round(percentUsed)
		};
	}
}

// Export class for factory instantiation
export { DocumentBrowserStorage };

// Export singleton for backward compatibility
export const documentBrowserStorage = new DocumentBrowserStorage();
