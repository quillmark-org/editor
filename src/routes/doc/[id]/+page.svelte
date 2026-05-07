<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { userStore } from '$lib/stores/user.svelte';
	import { documentStore } from '$lib/stores/documents.svelte';
	import { generateUniqueName } from '$lib/utils/document-naming';
	import { toastStore } from '$lib/stores/toast.svelte';
	import DocumentTeaser from '$lib/components/DocumentTeaser/DocumentTeaser.svelte';
	import AppHead from '$lib/components/AppHead.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	async function handleFork() {
		const doc = data.document;
		const name = generateUniqueName(doc.name, documentStore.documents.map((d) => d.name));

		if (userStore.isAuthenticated) {
			const res = await fetch(resolve('/api/documents'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, content: doc.content })
			});
			if (!res.ok) {
				toastStore.error('Failed to save document');
				return;
			}
			const result = (await res.json()) as { id: string };
			await goto(resolve(`/?open=${result.id}`));
		} else {
			try {
				const metadata = await documentStore.createDocument(name, doc.content);
				await goto(resolve(`/?open=${metadata.id}`));
			} catch {
				toastStore.error('Failed to save document');
			}
		}
	}
</script>

<AppHead title={data.document.name} />
<DocumentTeaser document={data.document} primaryAction={{ label: 'Save Copy', onclick: handleFork }} />
