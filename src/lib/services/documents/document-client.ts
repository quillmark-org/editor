/**
 * Document Client Service
 * Centralizes all document-related communication for client-side code
 * Uses dependency injection to work with any DocumentServiceContract implementation
 */

import type { DocumentListItem, DocumentServiceContract } from './types';
import { DocumentBrowserStorage } from './document-browser-storage';
import { APIDocumentService } from './api-document-service';

/**
 * Document Client
 * Provides a unified interface for document operations via dependency injection
 * Delegates all operations to an injected DocumentServiceContract implementation
 */
export class DocumentClient {
	constructor(
		private service: DocumentServiceContract,
		private userId: string
	) {}

	/**
	 * List all documents for the current user
	 */
	async listDocuments(): Promise<DocumentListItem[]> {
		const result = await this.service.listUserDocuments({
			user_id: this.userId
		});
		return result.documents;
	}

	/**
	 * Get a document with its content
	 */
	async getDocument(id: string): Promise<{ id: string; content: string; name: string }> {
		const doc = await this.service.getDocumentContent({
			user_id: this.userId,
			document_id: id
		});

		return {
			id: doc.id,
			name: doc.name,
			content: doc.content
		};
	}

	/**
	 * Create a new blank document. Template-backed creation goes through
	 * `importTemplate` in library-client (which hits /api/templates/[id]/import).
	 */
	async createDocument(name: string, content: string = ''): Promise<DocumentListItem> {
		const doc = await this.service.createDocument({
			owner_id: this.userId,
			name,
			content
		});

		const { content: _, ...metadata } = doc;
		return { ...metadata, published_as: null };
	}

	/**
	 * Update document content and/or name
	 */
	async updateDocument(
		id: string,
		updates: { content?: string; name?: string }
	): Promise<{ content_size_bytes?: number; updated_at?: string; content_hash?: string | null }> {
		const doc = await this.service.updateDocument({
			user_id: this.userId,
			document_id: id,
			content: updates.content,
			name: updates.name
		});
		return {
			content_size_bytes: doc.content_size_bytes,
			updated_at: doc.updated_at,
			content_hash: doc.content_hash
		};
	}

	/**
	 * Delete a document
	 */
	async deleteDocument(id: string): Promise<void> {
		await this.service.deleteDocument({
			user_id: this.userId,
			document_id: id
		});
	}

	/**
	 * Set document public status
	 */
	async setPublic(
		id: string,
		isPublic: boolean
	): Promise<{ is_public: boolean; updated_at: string }> {
		const metadata = await this.service.updateDocumentPublic({
			user_id: this.userId,
			document_id: id,
			is_public: isPublic
		});

		return {
			is_public: metadata.is_public,
			updated_at: metadata.updated_at
		};
	}
}

/**
 * Create a document client instance
 * Factory function that selects the appropriate service based on guest mode
 */
export function createDocumentClient(isGuest: boolean, userId: string = 'guest'): DocumentClient {
	const service = isGuest ? new DocumentBrowserStorage() : new APIDocumentService();

	return new DocumentClient(service, userId);
}
