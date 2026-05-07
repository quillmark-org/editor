<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DocumentTeaser from '$lib/components/DocumentTeaser/DocumentTeaser.svelte';
	import AppHead from '$lib/components/AppHead.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	async function handleSave() {
		if (data.state !== 'owned') return;
		try {
			const res = await fetch(resolve(`/api/documents/ephemeral/${data.document.id}/save`), {
				method: 'POST'
			});

			if (res.ok) {
				const result = (await res.json()) as { id: string };
				await goto(resolve(`/?open=${result.id}`));
				return;
			}

			const message = await readErrorMessage(res);

			if (res.status === 404) {
				toastStore.error(message ?? 'This link is no longer available');
				await goto(resolve('/'));
				return;
			}

			toastStore.error(message ?? 'Failed to save document');
		} catch (err) {
			console.error('Failed to save ephemeral document:', err);
			toastStore.error('Failed to save document');
		}
	}

	async function readErrorMessage(res: Response): Promise<string | null> {
		try {
			const body = (await res.json()) as { message?: unknown };
			return typeof body?.message === 'string' ? body.message : null;
		} catch {
			return null;
		}
	}
</script>

{#if data.state === 'owned'}
	<AppHead title={data.document.name} />
	<DocumentTeaser
		document={data.document}
		primaryAction={{ label: 'Save Copy', onclick: handleSave }}
		showCopyLink={false}
	/>
{:else if data.state === 'expired'}
	<AppHead title="Document expired" />
	<section class="mx-auto max-w-xl space-y-3 p-8 text-center">
		<h1 class="text-2xl font-semibold">This document has expired</h1>
		<p class="text-muted-foreground">
			This link is no longer available. Ask the sender to share a fresh one.
		</p>
	</section>
{:else}
	<AppHead title="Already claimed" />
	<section class="mx-auto max-w-xl space-y-3 p-8 text-center">
		<h1 class="text-2xl font-semibold">This link has already been claimed</h1>
		<p class="text-muted-foreground">
			Someone else opened this link first. If you were the intended recipient, ask the sender to
			share a fresh one.
		</p>
	</section>
{/if}
