/// <reference lib="WebWorker" />
/// <reference types="@sveltejs/kit" />

import { version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = `sw-${version}`;

self.addEventListener('install', ((event: ExtendableEvent) => {
	event.waitUntil(self.skipWaiting());
}) as EventListener);

self.addEventListener('activate', ((event: ExtendableEvent) => {
	event.waitUntil(
		caches.keys().then((keys) => {
			return Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
		})
	);
	self.clients.claim();
}) as EventListener);
