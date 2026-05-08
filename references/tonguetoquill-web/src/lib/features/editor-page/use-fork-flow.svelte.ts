import { generateUniqueName } from '$lib/utils/document-naming';
import type { PublicDocument } from '$lib/services/documents/types';
import { toastStore } from '$lib/stores/toast.svelte';
import { documentStore } from '$lib/stores/documents.svelte';

interface ForkFlowConfig {
	getCurrentUrl: () => URL;
	clearForkQuery: () => Promise<void>;
}

async function fetchDocument(
	documentId: string,
	_type: string | null
): Promise<PublicDocument | null> {
	try {
		const endpoint = `/api/public/documents/${documentId}`;
		const response = await fetch(endpoint, { credentials: 'same-origin' });
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	}
}

export function useForkFlow(config: ForkFlowConfig) {
	const { getCurrentUrl, clearForkQuery } = config;

	async function handleForkFromUrl() {
		const url = getCurrentUrl();
		const forkId = url.searchParams.get('fork');
		const forkType = url.searchParams.get('type');
		if (!forkId) return;

		await clearForkQuery();

		const sourceDoc = await fetchDocument(forkId, forkType);
		if (!sourceDoc) {
			toastStore.error('Could not fork document. It may be private or no longer available.');
			return;
		}

		const forkName = generateUniqueName(
			sourceDoc.name,
			documentStore.documents.map((d) => d.name)
		);
		try {
			await documentStore.createDocument(forkName, sourceDoc.content);
			toastStore.success(`Created "${forkName}" from shared document`);
		} catch {
			toastStore.error('Failed to create forked document');
		}
	}

	return {
		handleForkFromUrl
	};
}
