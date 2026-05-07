/**
 * Document Service Provider Factory
 * Always uses Drizzle service - mock mode uses pglite with auto-schema
 */

import type { DocumentServiceContract } from '$lib/services/documents/types';
import { DrizzleDocumentService } from './document-drizzle-service';

// Singleton instance
let service: DocumentServiceContract | null = null;

export async function getDocumentService(): Promise<DocumentServiceContract> {
	if (!service) {
		service = new DrizzleDocumentService();
	}
	return service;
}

// Export as documentService for backwards compatibility
// Methods are lazily initialized via the service singleton
export const documentService = {
	async createDocument(params: {
		user_id?: string;
		owner_id?: string;
		name: string;
		content: string;
	}) {
		const ownerId = params.user_id ?? params.owner_id;
		if (!ownerId) {
			throw new Error('createDocument requires user_id or owner_id');
		}
		return (await getDocumentService()).createDocument({
			owner_id: ownerId,
			name: params.name,
			content: params.content
		});
	},
	async getDocumentMetadata(params: { user_id: string; document_id: string }) {
		return (await getDocumentService()).getDocumentMetadata(params);
	},
	async getDocumentContent(params: { user_id: string; document_id: string }) {
		return (await getDocumentService()).getDocumentContent(params);
	},
	async updateDocument(params: {
		user_id: string;
		document_id: string;
		content?: string;
		name?: string;
		is_public?: boolean;
	}) {
		return (await getDocumentService()).updateDocument(params);
	},
	async updateDocumentContent(params: { user_id: string; document_id: string; content: string }) {
		return (await getDocumentService()).updateDocumentContent(params);
	},
	async updateDocumentName(params: { user_id: string; document_id: string; name: string }) {
		return (await getDocumentService()).updateDocumentName(params);
	},
	async updateDocumentPublic(params: { user_id: string; document_id: string; is_public: boolean }) {
		return (await getDocumentService()).updateDocumentPublic(params);
	},
	async deleteDocument(params: { user_id: string; document_id: string }) {
		return (await getDocumentService()).deleteDocument(params);
	},
	async listUserDocuments(params: { user_id: string; limit?: number; offset?: number }) {
		return (await getDocumentService()).listUserDocuments(params);
	},
	async getPublicDocument(documentId: string) {
		return (await getDocumentService()).getPublicDocument(documentId);
	}
};
