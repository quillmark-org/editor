import { responsiveStore } from '$lib/stores/responsive.svelte';
import { userStore } from '$lib/stores/user.svelte';
import { documentStore } from '$lib/stores/documents.svelte';
import { runGuestFirstVisitActions } from '$lib/services/guest';
import type { DocumentListItem } from '$lib/services/documents/types';

interface PageInitializationData {
	documents?: DocumentListItem[] | null;
}

interface PageInitializationConfig {
	getData: () => PageInitializationData;
	getUrl: () => URL;
	clearOpenQuery: () => Promise<void>;
}

export function usePageInitialization(config: PageInitializationConfig) {
	const { getData, getUrl, clearOpenQuery } = config;

	async function handleOpenFromUrl() {
		const openId = getUrl().searchParams.get('open');
		if (!openId) return;
		await clearOpenQuery();
		await documentStore.selectDocument(openId);
	}

	async function initializePage() {
		responsiveStore.initialize();

		const isAuthenticated = userStore.isAuthenticated;
		const userId = userStore.userId;
		const data = getData();

		if (isAuthenticated && userId) {
			if (!data.documents) {
				throw new Error('SSR failed to provide documents for authenticated user');
			}

			documentStore.initializeCloudDocuments(data.documents);
			await documentStore.fetchLocalDocuments();
		} else {
			await runGuestFirstVisitActions().catch(console.error);
			await documentStore.fetchGuestDocuments();
		}

		await handleOpenFromUrl();
	}

	return {
		initializePage
	};
}
