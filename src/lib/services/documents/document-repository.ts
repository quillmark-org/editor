import { createDocumentClient, type DocumentClient } from './document-client';
import type { DocumentMetadata } from './types';

export type DocumentSource = 'cloud' | 'local';

interface DocumentSessionContext {
	isGuest: boolean;
	userId: string;
}

/**
 * Repository boundary that consolidates document source policy with client selection.
 *
 * Keeps source-routing rules in one place so state orchestration code can stay focused
 * on UI state transitions and optimistic updates.
 */
export class DocumentRepository {
	constructor(private getSession: () => DocumentSessionContext) {}

	getClientForSource(source: DocumentSource): DocumentClient {
		const session = this.getSession();
		if (source === 'local') {
			return createDocumentClient(true, 'guest');
		}
		return createDocumentClient(false, session.userId);
	}

	getClientForNewDocument(): { source: DocumentSource; client: DocumentClient } {
		const session = this.getSession();
		const source: DocumentSource = session.isGuest ? 'local' : 'cloud';
		return {
			source,
			client: this.getClientForSource(source)
		};
	}

	resolveSourceById(
		id: string,
		cloudDocuments: DocumentMetadata[],
		localDocuments: DocumentMetadata[]
	): DocumentSource | null {
		if (cloudDocuments.some((d) => d.id === id)) return 'cloud';
		if (localDocuments.some((d) => d.id === id)) return 'local';
		return null;
	}

	getActiveClient(activeSource: DocumentSource | null): DocumentClient {
		const session = this.getSession();
		if (activeSource === 'local' || session.isGuest) {
			return createDocumentClient(true, 'guest');
		}
		return createDocumentClient(false, session.userId);
	}
}
