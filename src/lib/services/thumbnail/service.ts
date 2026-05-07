import { browser } from '$app/environment';
import type { QuillMetadata } from '$lib/services/quillmark/types';
import ThumbnailWorker from './worker?worker';

export const THUMBNAIL_CACHE_NAME = 'thumbnails-v1';
export const THUMBNAIL_CACHE_KEY_PREFIX = '/thumbnail/';

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
interface ReadyReply {
	type: 'ready';
}
type WorkerReply = RenderedReply | ErrorReply | ReadyReply;

let worker: Worker | null = null;
let workerReady: Promise<void> | null = null;
let nextRequestId = 1;
const pending = new Map<number, { resolve: (b: Blob) => void; reject: (e: unknown) => void }>();

function ensureWorker(): Worker {
	if (worker) return worker;
	worker = new ThumbnailWorker();
	worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
		const msg = event.data;
		if (msg.type === 'rendered') {
			const entry = pending.get(msg.id);
			if (!entry) return;
			pending.delete(msg.id);
			entry.resolve(msg.blob);
		} else if (msg.type === 'error') {
			const entry = pending.get(msg.id);
			if (!entry) return;
			pending.delete(msg.id);
			entry.reject(new Error(msg.message));
		}
	});
	return worker;
}

/**
 * Spawn the thumbnail worker and kick off WASM init. Idempotent. Call this at
 * app load (from the root layout) so the renderer is warm by the time any
 * caller invokes `renderThumbnail`.
 */
export function prewarmThumbnailRenderer(quillManifest: QuillMetadata[]): Promise<void> {
	if (!browser) return Promise.resolve();
	if (workerReady) return workerReady;
	const w = ensureWorker();
	workerReady = new Promise<void>((resolve) => {
		const onReady = (event: MessageEvent<WorkerReply>) => {
			if (event.data?.type === 'ready') {
				w.removeEventListener('message', onReady);
				resolve();
			}
		};
		w.addEventListener('message', onReady);
		w.postMessage({ type: 'init', quillManifest });
	});
	return workerReady;
}

/**
 * Render first-page PNG thumbnail at 100ppi and cache by content hash. Render
 * itself runs off the main thread in `worker.ts`; cache reads/writes stay here.
 */
export async function renderThumbnail(markdown: string, contentHash: string): Promise<Blob> {
	const cache = await caches.open(THUMBNAIL_CACHE_NAME);
	const cacheKey = `${THUMBNAIL_CACHE_KEY_PREFIX}${contentHash}`;

	const cachedResponse = await cache.match(cacheKey);
	if (cachedResponse) {
		return await cachedResponse.blob();
	}

	if (!workerReady) {
		throw new Error(
			'Thumbnail renderer not initialized. Call prewarmThumbnailRenderer() at app load.'
		);
	}
	await workerReady;
	const w = ensureWorker();
	const id = nextRequestId++;
	const blob = await new Promise<Blob>((resolve, reject) => {
		pending.set(id, { resolve, reject });
		w.postMessage({ type: 'render', id, markdown });
	});

	void cache.put(cacheKey, new Response(blob)).catch((error) => {
		console.warn('Failed to cache thumbnail', error);
	});

	return blob;
}
