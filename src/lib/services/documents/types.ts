/**
 * Document Service Types and Contracts
 * Defines interfaces for document service providers (mock and real)
 */

import type { UUID } from '../auth/types';
import { createErrorClass } from '$lib/errors';

// Re-export UUID for convenience
export type { UUID };

/**
 * Document interface representing a full document with content
 */
export interface Document {
	id: UUID;
	owner_id: UUID;
	name: string;
	content: string;
	content_size_bytes: number;
	is_public: boolean;
	content_hash: string | null;
	created_at: string; // ISO 8601 timestamp
	updated_at: string; // ISO 8601 timestamp
}

/**
 * Document metadata (without content field for performance)
 */
export interface DocumentMetadata {
	id: UUID;
	owner_id: UUID;
	name: string;
	content_size_bytes: number;
	is_public: boolean;
	content_hash: string | null;
	created_at: string;
	updated_at: string;
}

/**
 * Reference to a published template derived from a document.
 * Returned as part of the documents-list projection so the UI can detect
 * publication status (and the source-of-divergence content_hash) without
 * a second round-trip.
 */
export interface TemplateRef {
	id: UUID;
	content_hash: string | null;
}

/**
 * Documents-list read projection.
 * `published_as` is computed by LEFT JOINing `templates ON template.document_id = document.id`
 * in `listUserDocuments`; it is intentionally absent from the canonical
 * `Document` / `DocumentMetadata` aggregates so single-doc fetches and
 * write paths stay free of cross-aggregate state.
 */
export interface DocumentListItem extends DocumentMetadata {
	published_as: TemplateRef | null;
}

/**
 * Public document response (for public viewer, excludes sensitive fields)
 */
export interface PublicDocument {
	id: UUID;
	name: string;
	content: string;
	owner_display_name: string; // Display name of the owner (e.g., "nibs" or "Anonymous")
}

/**
 * Document list result with pagination
 */
export interface DocumentListResult {
	documents: DocumentListItem[];
	total: number;
	limit: number;
	offset: number;
}

/**
 * Document error codes
 */
export type DocumentErrorCode =
	| 'not_found'
	| 'unauthorized'
	| 'invalid_name'
	| 'content_too_large'
	| 'validation_error'
	| 'rate_limited'
	| 'unknown_error';

/**
 * Document error class
 */
export const DocumentError = createErrorClass<DocumentErrorCode>('DocumentError');

/**
 * Create document parameters
 */
export interface CreateDocumentParams {
	owner_id: UUID;
	name: string;
	content: string;
}

/**
 * Update content parameters
 */
export interface UpdateContentParams {
	user_id: UUID;
	document_id: UUID;
	content: string;
}

/**
 * Update name parameters
 */
export interface UpdateNameParams {
	user_id: UUID;
	document_id: UUID;
	name: string;
}

/**
 * Update public status parameters
 */
export interface UpdatePublicParams {
	user_id: UUID;
	document_id: UUID;
	is_public: boolean;
}

/**
 * Atomic update parameters (any subset of mutable fields)
 */
export interface UpdateDocumentParams {
	user_id: UUID;
	document_id: UUID;
	content?: string;
	name?: string;
	is_public?: boolean;
}

/**
 * List documents parameters
 */
export interface ListDocumentsParams {
	user_id: UUID;
	limit?: number;
	offset?: number;
}

/**
 * Document identity parameters
 */
export interface DocumentReferenceParams {
	user_id: UUID;
	document_id: UUID;
}

/**
 * Document service contract interface
 * All document service providers (mock and real) must implement this interface
 */
export interface DocumentServiceContract {
	/**
	 * Create a new document
	 */
	createDocument(params: CreateDocumentParams): Promise<Document>;

	/**
	 * Get document metadata only (no content)
	 */
	getDocumentMetadata(params: DocumentReferenceParams): Promise<DocumentMetadata>;

	/**
	 * Get full document with content
	 */
	getDocumentContent(params: DocumentReferenceParams): Promise<Document>;

	/**
	 * Atomically update one or more mutable fields.
	 * Returns the canonical full document after the update.
	 */
	updateDocument(params: UpdateDocumentParams): Promise<Document>;

	/**
	 * Update document content
	 */
	updateDocumentContent(params: UpdateContentParams): Promise<Document>;

	/**
	 * Update document name
	 */
	updateDocumentName(params: UpdateNameParams): Promise<DocumentMetadata>;

	/**
	 * Update document public status
	 */
	updateDocumentPublic(params: UpdatePublicParams): Promise<DocumentMetadata>;

	/**
	 * Delete a document
	 */
	deleteDocument(params: DocumentReferenceParams): Promise<void>;

	/**
	 * List user's documents with pagination
	 */
	listUserDocuments(params: ListDocumentsParams): Promise<DocumentListResult>;

	/**
	 * Get public document by ID (no authentication required)
	 * Returns null if document doesn't exist or is not public
	 */
	getPublicDocument(documentId: UUID): Promise<PublicDocument | null>;
}
