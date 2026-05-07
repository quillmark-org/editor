/**
 * Drizzle Document Service
 * Implements DocumentServiceContract using Drizzle ORM
 */

import { eq, and, desc, count } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db';
import { mapDrizzleError } from '$lib/server/db/errors';
import { rethrowUnless, AppError } from '$lib/errors';
import {
	DocumentError,
	type CreateDocumentParams,
	type DocumentReferenceParams,
	type Document,
	type DocumentListItem,
	type DocumentListResult,
	type DocumentMetadata,
	type DocumentServiceContract,
	type ListDocumentsParams,
	type PublicDocument,
	type UpdateContentParams,
	type UpdateDocumentParams,
	type UpdateNameParams,
	type UpdatePublicParams,
	type UUID
} from '$lib/services/documents/types';
import { DocumentValidator } from '$lib/services/documents/document-validator';
import { computeContentHash } from '$lib/server/utils/content-hash';

/**
 * Map Drizzle document row to service Document type
 * Converts camelCase to snake_case and Date to string
 */
function mapToDocument(row: typeof schema.documents.$inferSelect): Document {
	return {
		id: row.id,
		owner_id: row.ownerId,
		name: row.name,
		content: row.content,
		content_size_bytes: row.contentSizeBytes,
		is_public: row.isPublic,
		content_hash: row.contentHash ?? null,
		created_at: row.createdAt.toISOString(),
		updated_at: row.updatedAt.toISOString()
	};
}

/**
 * Map Drizzle document row to service DocumentMetadata type
 */
function mapToMetadata(row: {
	id: string;
	ownerId: string;
	name: string;
	contentSizeBytes: number;
	isPublic: boolean;
	contentHash: string | null;
	createdAt: Date;
	updatedAt: Date;
}): DocumentMetadata {
	return {
		id: row.id,
		owner_id: row.ownerId,
		name: row.name,
		content_size_bytes: row.contentSizeBytes,
		is_public: row.isPublic,
		content_hash: row.contentHash ?? null,
		created_at: row.createdAt.toISOString(),
		updated_at: row.updatedAt.toISOString()
	};
}

/**
 * Map a documents-list row (with LEFT-joined template ref) to DocumentListItem.
 */
function mapToListItem(row: {
	id: string;
	ownerId: string;
	name: string;
	contentSizeBytes: number;
	isPublic: boolean;
	contentHash: string | null;
	createdAt: Date;
	updatedAt: Date;
	publishedTemplateId: string | null;
	publishedTemplateContentHash: string | null;
}): DocumentListItem {
	return {
		...mapToMetadata(row),
		published_as: row.publishedTemplateId
			? { id: row.publishedTemplateId, content_hash: row.publishedTemplateContentHash ?? null }
			: null
	};
}

/**
 * Drizzle Document Service
 * Uses Drizzle ORM with PostgreSQL for document storage
 */
export class DrizzleDocumentService implements DocumentServiceContract {
	/**
	 * Create a new document
	 */
	async createDocument(params: CreateDocumentParams): Promise<Document> {
		const { owner_id, name, content } = params;

		DocumentValidator.validateName(name);
		DocumentValidator.validateContent(content);

		const content_size_bytes = DocumentValidator.getByteLength(content);

		try {
			const db = await getDb();
			const contentHash = computeContentHash(content);
			const [createdDoc] = await db
				.insert(schema.documents)
				.values({
					ownerId: owner_id,
					name,
					content,
					contentSizeBytes: content_size_bytes,
					contentHash
				})
				.returning();

			return mapToDocument(createdDoc);
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	/**
	 * Get document metadata only (no content)
	 */
	async getDocumentMetadata({
		user_id,
		document_id
	}: {
		user_id: UUID;
		document_id: UUID;
	}): Promise<DocumentMetadata> {
		try {
			const db = await getDb();
			const [doc] = await db
				.select({
					id: schema.documents.id,
					ownerId: schema.documents.ownerId,
					name: schema.documents.name,
					contentSizeBytes: schema.documents.contentSizeBytes,
					isPublic: schema.documents.isPublic,
					contentHash: schema.documents.contentHash,
					createdAt: schema.documents.createdAt,
					updatedAt: schema.documents.updatedAt
				})
				.from(schema.documents)
				.where(and(eq(schema.documents.id, document_id), eq(schema.documents.ownerId, user_id)));

			if (!doc) {
				throw new DocumentError('not_found', 'Document not found', 404);
			}

			return mapToMetadata(doc);
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	/**
	 * Get full document with content
	 */
	async getDocumentContent({
		user_id,
		document_id
	}: {
		user_id: UUID;
		document_id: UUID;
	}): Promise<Document> {
		try {
			const db = await getDb();
			const [doc] = await db
				.select()
				.from(schema.documents)
				.where(and(eq(schema.documents.id, document_id), eq(schema.documents.ownerId, user_id)));

			if (!doc) {
				throw new DocumentError('not_found', 'Document not found', 404);
			}

			return mapToDocument(doc);
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	/**
	 * Atomically update document fields and return canonical full document.
	 */
	async updateDocument(params: UpdateDocumentParams): Promise<Document> {
		const { user_id, document_id, content, name, is_public } = params;

		if (content === undefined && name === undefined && is_public === undefined) {
			throw new DocumentError(
				'validation_error',
				'At least one of content, name, or is_public must be provided',
				400
			);
		}

		if (content !== undefined) {
			DocumentValidator.validateContent(content);
		}
		if (name !== undefined) {
			DocumentValidator.validateName(name);
		}

		try {
			const db = await getDb();
			const updateValues: Partial<typeof schema.documents.$inferInsert> & { updatedAt: Date } = {
				updatedAt: new Date()
			};

			if (content !== undefined) {
				updateValues.content = content;
				updateValues.contentSizeBytes = DocumentValidator.getByteLength(content);
				updateValues.contentHash = computeContentHash(content);
			}
			if (name !== undefined) {
				updateValues.name = name;
			}
			if (is_public !== undefined) {
				updateValues.isPublic = is_public;
			}

			const [doc] = await db
				.update(schema.documents)
				.set(updateValues)
				.where(and(eq(schema.documents.id, document_id), eq(schema.documents.ownerId, user_id)))
				.returning();

			if (!doc) {
				throw new DocumentError('not_found', 'Document not found', 404);
			}

			return mapToDocument(doc);
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	/**
	 * Update document content
	 */
	async updateDocumentContent(params: UpdateContentParams): Promise<Document> {
		const { user_id, document_id, content } = params;

		// Validate content
		DocumentValidator.validateContent(content);

		const content_size_bytes = DocumentValidator.getByteLength(content);

		try {
			const db = await getDb();
			const contentHash = computeContentHash(content);
			const [doc] = await db
				.update(schema.documents)
				.set({
					content,
					contentSizeBytes: content_size_bytes,
					contentHash,
					updatedAt: new Date()
				})
				.where(and(eq(schema.documents.id, document_id), eq(schema.documents.ownerId, user_id)))
				.returning();

			if (!doc) {
				throw new DocumentError('not_found', 'Document not found', 404);
			}

			return mapToDocument(doc);
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	/**
	 * Update document name
	 */
	async updateDocumentName(params: UpdateNameParams): Promise<DocumentMetadata> {
		const { user_id, document_id, name } = params;

		// Validate name
		DocumentValidator.validateName(name);

		try {
			const db = await getDb();
			const [doc] = await db
				.update(schema.documents)
				.set({
					name,
					updatedAt: new Date()
				})
				.where(and(eq(schema.documents.id, document_id), eq(schema.documents.ownerId, user_id)))
				.returning();

			if (!doc) {
				throw new DocumentError('not_found', 'Document not found', 404);
			}

			return mapToMetadata(doc);
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	/**
	 * Update document public status
	 */
	async updateDocumentPublic(params: UpdatePublicParams): Promise<DocumentMetadata> {
		const { user_id, document_id, is_public } = params;

		try {
			const db = await getDb();
			const [doc] = await db
				.update(schema.documents)
				.set({
					isPublic: is_public,
					updatedAt: new Date()
				})
				.where(and(eq(schema.documents.id, document_id), eq(schema.documents.ownerId, user_id)))
				.returning();

			if (!doc) {
				throw new DocumentError('not_found', 'Document not found', 404);
			}

			return mapToMetadata(doc);
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	/**
	 * Delete a document
	 */
	async deleteDocument(params: DocumentReferenceParams): Promise<void> {
		const { user_id, document_id } = params;

		try {
			const db = await getDb();
			const result = await db
				.delete(schema.documents)
				.where(and(eq(schema.documents.id, document_id), eq(schema.documents.ownerId, user_id)))
				.returning();

			if (result.length === 0) {
				throw new DocumentError('not_found', 'Document not found', 404);
			}
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	/**
	 * List user's documents with pagination
	 */
	async listUserDocuments(params: ListDocumentsParams): Promise<DocumentListResult> {
		const { user_id, limit = 50, offset = 0 } = params;

		// Validate limit
		const validatedLimit = Math.min(limit, 100);

		try {
			const db = await getDb();

			// LEFT JOIN templates so each row carries its publication ref
			// (id + content_hash) when the document has been published.
			// Covered by `templates_document_id_idx` (unique) — one index
			// lookup per document row.
			const docs = await db
				.select({
					id: schema.documents.id,
					ownerId: schema.documents.ownerId,
					name: schema.documents.name,
					contentSizeBytes: schema.documents.contentSizeBytes,
					isPublic: schema.documents.isPublic,
					contentHash: schema.documents.contentHash,
					createdAt: schema.documents.createdAt,
					updatedAt: schema.documents.updatedAt,
					publishedTemplateId: schema.templates.id,
					publishedTemplateContentHash: schema.templates.contentHash
				})
				.from(schema.documents)
				.leftJoin(schema.templates, eq(schema.templates.documentId, schema.documents.id))
				.where(eq(schema.documents.ownerId, user_id))
				.orderBy(desc(schema.documents.createdAt))
				.limit(validatedLimit)
				.offset(offset);

			const [countResult] = await db
				.select({ total: count() })
				.from(schema.documents)
				.where(eq(schema.documents.ownerId, user_id));

			return {
				documents: docs.map(mapToListItem),
				total: countResult.total,
				limit: validatedLimit,
				offset
			};
		} catch (error) {
			throw mapDrizzleError(error);
		}
	}

	/**
	 * Get public document by ID (no authentication required)
	 * Returns null if document doesn't exist or is not public
	 *
	 * Note: Uses user's name for display, falls back to "Anonymous" if not set.
	 * Never exposes email address for privacy.
	 */
	async getPublicDocument(documentId: UUID): Promise<PublicDocument | null> {
		const db = await getDb();

		// Query document with is_public = true, join with users for owner name
		const [result] = await db
			.select({
				id: schema.documents.id,
				name: schema.documents.name,
				content: schema.documents.content,
				ownerName: schema.users.name
			})
			.from(schema.documents)
			.innerJoin(schema.users, eq(schema.documents.ownerId, schema.users.id))
			.where(and(eq(schema.documents.id, documentId), eq(schema.documents.isPublic, true)));

		if (!result) {
			return null;
		}

		return {
			id: result.id,
			name: result.name,
			content: result.content,
			owner_display_name: result.ownerName || 'Anonymous'
		};
	}
}
