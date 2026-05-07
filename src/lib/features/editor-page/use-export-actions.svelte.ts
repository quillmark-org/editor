import { toastStore } from '$lib/stores/toast.svelte';
import { documentStore } from '$lib/stores/documents.svelte';
import { userStore } from '$lib/stores/user.svelte';
import { quillmarkService, resultToBlob, resultToSVGPages } from '$lib/services/quillmark';
import { browser } from '$app/environment';

export function useExportActions() {
	/** Fire-and-forget: notify server of a document export (authenticated users only) */
	function trackExport(documentId?: string | null) {
		if (!browser || !userStore.isAuthenticated) return;
		setTimeout(() => {
			fetch('/api/metrics/export', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ document_id: documentId ?? null })
			}).catch(() => {});
		}, 0);
	}

	async function handleDownload() {
		if (!documentStore.activeDocumentId) return;

		try {
			const loaded = documentStore.loadedDocument;
			if (!loaded) return;
			const doc = { content: loaded.content, name: loaded.name };
			const result = await quillmarkService.render(doc.content, 'pdf');

			let blob: Blob;
			let extension: string;

			if (result.outputFormat === 'pdf') {
				blob = resultToBlob(result);
				extension = '.pdf';
			} else if (result.outputFormat === 'svg') {
				const svgPages = resultToSVGPages(result);
				blob = new Blob([svgPages[0]], { type: 'image/svg+xml' });
				extension = '.svg';
			} else {
				blob = new Blob([doc.content], { type: 'text/markdown' });
				extension = '.md';
			}

			const baseName = doc.name.replace(/\.(md|markdown)$/i, '');
			const filename = baseName + extension;

			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);

			trackExport(documentStore.activeDocumentId);
		} catch (error) {
			console.error('Download failed:', error);
			toastStore.error('Failed to download document');
		}
	}

	async function handleDownloadMarkdown() {
		if (!documentStore.activeDocumentId) return;

		try {
			const loaded = documentStore.loadedDocument;
			if (!loaded) return;
			const blob = new Blob([loaded.content], { type: 'text/markdown' });
			const baseName = loaded.name.replace(/\.(md|markdown)$/i, '');
			const filename = baseName + '.md';

			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);

			trackExport(documentStore.activeDocumentId);
		} catch (error) {
			console.error('Markdown download failed:', error);
			toastStore.error('Failed to download markdown');
		}
	}

	return {
		handleDownload,
		handleDownloadMarkdown
	};
}
