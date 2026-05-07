import type { Document, DocumentMetadata } from './types';

/**
 * Maps raw API response data to a Document object.
 */
export function mapToDocument(data: unknown): Document {
	const doc = data as Record<string, unknown>;

	return {
		id: doc.id as string,
		owner_id: doc.owner_id as string,
		name: doc.name as string,
		content: doc.content as string,
		content_size_bytes: doc.content_size_bytes as number,
		is_public: doc.is_public as boolean,
		content_hash: (doc.content_hash as string) ?? null,
		created_at: doc.created_at as string,
		updated_at: doc.updated_at as string
	};
}

/**
 * Extracts metadata-only fields from a Document object.
 * Useful for when we have a full document but only need the metadata interface.
 */
export function mapToMetadata(doc: Document): DocumentMetadata {
	const { content: _, ...metadata } = doc;
	return metadata;
}
