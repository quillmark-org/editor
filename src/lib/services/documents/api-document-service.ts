/**
 * API Document Service
 * Implements DocumentServiceContract by making HTTP requests to the document API
 * Used for authenticated users to interact with server-side storage
 */

import type {
	CreateDocumentParams,
	Document,
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
import { mapToDocument, mapToMetadata } from './mappers';
import { SessionExpiredError } from '$lib/errors/session-expired-error';

/**
 * API Document Service
 * Wraps fetch calls to /api/documents endpoints
 */
export class APIDocumentService implements DocumentServiceContract {
	/**
	 * Fetch wrapper that throws SessionExpiredError on 401.
	 */
	private async authFetch(url: string, init?: RequestInit): Promise<Response> {
		const response = await fetch(url, init);
		if (response.status === 401) throw new SessionExpiredError();
		return response;
	}

	/**
	 * Create a new document
	 */
	async createDocument(params: CreateDocumentParams): Promise<Document> {
		const { name, content } = params;

		const response = await this.authFetch('/api/documents', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, content })
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			console.error('Create document error:', errorData);
			throw new Error(errorData.message || 'Failed to create document');
		}

		const data = await response.json();
		return mapToDocument(data);
	}

	/**
	 * Get document metadata only (no content)
	 */
	async getDocumentMetadata(params: DocumentReferenceParams): Promise<DocumentMetadata> {
		// Fetch full document and strip content
		const document = await this.getDocumentContent(params);
		return mapToMetadata(document);
	}

	/**
	 * Get full document with content
	 */
	async getDocumentContent(params: DocumentReferenceParams): Promise<Document> {
		const { document_id } = params;

		const response = await this.authFetch(`/api/documents/${document_id}`);

		if (!response.ok) {
			throw new Error('Failed to fetch document');
		}

		const data = await response.json();
		return mapToDocument(data);
	}

	/**
	 * Atomically update one or more mutable fields.
	 */
	async updateDocument(params: UpdateDocumentParams): Promise<Document> {
		const { document_id, content, name, is_public } = params;

		const response = await this.authFetch(`/api/documents/${document_id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content, name, is_public })
		});

		if (!response.ok) {
			throw new Error('Failed to update document');
		}

		const data = await response.json();
		return mapToDocument(data);
	}

	/**
	 * Update document content
	 */
	async updateDocumentContent(params: UpdateContentParams): Promise<Document> {
		const { document_id, content } = params;

		const response = await this.authFetch(`/api/documents/${document_id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content })
		});

		if (!response.ok) {
			throw new Error('Failed to update document');
		}

		const data = await response.json();
		return mapToDocument(data);
	}

	/**
	 * Update document name
	 */
	async updateDocumentName(params: UpdateNameParams): Promise<DocumentMetadata> {
		const { document_id, name } = params;

		const response = await this.authFetch(`/api/documents/${document_id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name })
		});

		if (!response.ok) {
			throw new Error('Failed to update document');
		}

		const data = await response.json();
		return mapToMetadata(mapToDocument(data));
	}

	/**
	 * Update document public status
	 */
	async updateDocumentPublic(params: UpdatePublicParams): Promise<DocumentMetadata> {
		const { document_id, is_public } = params;

		const response = await this.authFetch(`/api/documents/${document_id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ is_public })
		});

		if (!response.ok) {
			throw new Error('Failed to update document');
		}

		const data = await response.json();
		return mapToMetadata(mapToDocument(data));
	}

	/**
	 * Delete a document
	 */
	async deleteDocument(params: DocumentReferenceParams): Promise<void> {
		const { document_id } = params;

		const response = await this.authFetch(`/api/documents/${document_id}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			throw new Error('Failed to delete document');
		}
	}

	/**
	 * List user's documents with pagination
	 */
	async listUserDocuments(params: ListDocumentsParams): Promise<DocumentListResult> {
		const { limit, offset } = params;

		// Build query params
		const queryParams = new URLSearchParams();
		if (limit !== undefined) queryParams.set('limit', limit.toString());
		if (offset !== undefined) queryParams.set('offset', offset.toString());

		const url = `/api/documents${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

		const response = await this.authFetch(url);

		if (!response.ok) {
			throw new Error('Failed to fetch documents');
		}

		const data = await response.json();

		return {
			documents: data.documents,
			total: data.total,
			limit: data.limit,
			offset: data.offset
		};
	}

	/**
	 * Get public document by ID (no authentication required)
	 */
	async getPublicDocument(documentId: UUID): Promise<PublicDocument | null> {
		try {
			const response = await fetch(`/api/public/documents/${documentId}`);

			if (!response.ok) {
				// Return null for any non-ok response (404, 403, etc.)
				return null;
			}

			const data = await response.json();
			return data;
		} catch {
			// Return null for any network errors
			return null;
		}
	}
}
