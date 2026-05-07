/// <reference lib="webworker" />

/**
 * Thumbnail render worker.
 *
 * Owns its own QuillmarkService instance so the WASM render pipeline runs off
 * the main thread. The main-thread client (service.ts) sends `init` once with
 * the SSR quill manifest, then `render` per template.
 */

import { quillmarkService } from '$lib/services/quillmark';
import type { OutputFormat } from '@quillmark/wasm';
import type { QuillMetadata } from '$lib/services/quillmark/types';

interface InitMessage {
	type: 'init';
	quillManifest: QuillMetadata[];
}

interface RenderMessage {
	type: 'render';
	id: number;
	markdown: string;
}

type InboundMessage = InitMessage | RenderMessage;

interface ReadyReply {
	type: 'ready';
}

interface RenderedReply {
	type: 'rendered';
	id: number;
	blob: Blob;
}

interface ErrorReply {
	type: 'error';
	id: number;
	message: string;
}

type OutboundMessage = ReadyReply | RenderedReply | ErrorReply;

let initPromise: Promise<void> | null = null;

function ensureInit(quillManifest: QuillMetadata[]): Promise<void> {
	if (initPromise) return initPromise;
	quillmarkService.initializeWithManifest(quillManifest);
	initPromise = quillmarkService.initialize();
	return initPromise;
}

self.addEventListener('message', (event: MessageEvent<InboundMessage>) => {
	const msg = event.data;
	if (msg.type === 'init') {
		void ensureInit(msg.quillManifest).then(
			() => post({ type: 'ready' }),
			(error: unknown) => {
				console.error('[thumbnail-worker] init failed', error);
			}
		);
		return;
	}

	if (msg.type === 'render') {
		void renderOne(msg.id, msg.markdown);
	}
});

async function renderOne(id: number, markdown: string): Promise<void> {
	try {
		if (!initPromise) {
			throw new Error('Worker not initialized — send init message first');
		}
		await initPromise;
		const result = await quillmarkService.render(markdown, 'png' as OutputFormat, {
			ppi: 100,
			pages: [0]
		});
		const artifact = result.artifacts[0];
		if (!artifact) {
			throw new Error('Invalid render result: no artifacts returned');
		}
		const blob = new Blob([artifact.bytes as BlobPart], { type: artifact.mimeType });
		post({ type: 'rendered', id, blob });
	} catch (error) {
		post({
			type: 'error',
			id,
			message: error instanceof Error ? error.message : String(error)
		});
	}
}

function post(message: OutboundMessage): void {
	(self as DedicatedWorkerGlobalScope).postMessage(message);
}
