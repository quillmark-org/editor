<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import '../app.css';
	import Toast from '$lib/components/ui/toast.svelte';
	import AppHead from '$lib/components/AppHead.svelte';
	import ClassificationBanner from '$lib/components/ui/classification-banner.svelte';
	import { templateService } from '$lib/services/templates';
	import { quillmarkService } from '$lib/services/quillmark';
	import { prewarmThumbnailRenderer, warmHomeThumbnails } from '$lib/services/thumbnail';
	import { loginClient } from '$lib/services/auth/login-client';
	import { userStore } from '$lib/stores/user.svelte';
	import type { Session, AuthProviderConfig } from '$lib/services/auth/types';
	import type { QuillMetadata } from '$lib/services/quillmark/types';
	import type { TemplateMetadata } from '$lib/services/templates/types';
	import { useHotkey } from '$lib/services/hotkey';
	import { overlayStore } from '$lib/stores/overlay.svelte';
	import { loginModalStore } from '$lib/stores/login-modal.svelte';
	import FeatureLoginModal from '$lib/components/FeatureLoginModal.svelte';

	interface Props {
		children?: import('svelte').Snippet;
		data: {
			session: Session | null;
			providers: AuthProviderConfig[];
			isVercel: boolean;
			templateManifest: TemplateMetadata[];
			quillManifest: QuillMetadata[];
		};
	}

	let { children, data }: Props = $props();

	// Configure services synchronously with SSR data
	// These MUST run before child components mount (not in $effect which runs after)
	// Note: Manifests are static imports, so they never change during client-side navigation
	// svelte-ignore state_referenced_locally
	loginClient.initializeProviders(data.providers);
	// svelte-ignore state_referenced_locally
	templateService.initializeWithManifest(data.templateManifest);
	// svelte-ignore state_referenced_locally
	quillmarkService.initializeWithManifest(data.quillManifest);
	// Spawn thumbnail worker + kick off WASM init off-main-thread. Fire-and-forget;
	// renderThumbnail() awaits this internally.
	// svelte-ignore state_referenced_locally
	void prewarmThumbnailRenderer(data.quillManifest);

	// Session can change (login/logout), so use $effect for reactive updates
	// svelte-ignore state_referenced_locally
	userStore.setSession(data.session);
	$effect(() => {
		userStore.setSession(data.session);
	});


	$effect(() => {
		if (userStore.sessionExpired) {
			loginModalStore.show('session_expired');
		}
	});

	// Proactive session check when tab returns to foreground
	let lastSessionCheck = 0;

	onMount(() => {
		function handleVisibilityChange() {
			if (document.visibilityState !== 'visible') return;
			if (!userStore.isAuthenticated) return;

			// Throttle: at most once per 30 seconds
			const now = Date.now();
			if (now - lastSessionCheck < 30_000) return;
			lastSessionCheck = now;

			fetch('/auth/session')
				.then((res) => res.json())
				.then((data) => {
					if (!data || !data.user) {
						userStore.markSessionExpired();
					}
				})
				.catch(() => {
					// Network error — don't mark expired, might be offline
				});
		}

		document.addEventListener('visibilitychange', handleVisibilityChange);

		void (async () => {
			// Register the service worker (updates, PWA); navigations use the browser network stack.
			if ('serviceWorker' in navigator) {
				navigator.serviceWorker
					.register(`${base}/service-worker.js`, { type: 'module' })
					.catch((error) => {
						console.error('Service worker registration failed:', error);
					});
			}

			// Initialize Vercel Analytics only if on Vercel
			if (import.meta.env.PROD && data.isVercel) {
				try {
					const { inject } = await import('@vercel/analytics');
					inject();
				} catch {
					// Silently fail if analytics can't be loaded (e.g. self-hosted without the package)
				}
				try {
					const { injectSpeedInsights } = await import('@vercel/speed-insights/sveltekit');
					injectSpeedInsights();
				} catch {
					// Silently fail if speed insights can't be loaded (e.g. self-hosted without the package)
				}
			}

			await templateService.initialize();

			// Pre-render the NewDocumentModal home set so the first open is instant.
			// Runs in the worker; main thread stays responsive. Newly-published
			// community templates surfaced after this warm fall back to the modal's
			// existing on-demand thumbnail path.
			void warmHomeThumbnails({ isAuthenticated: userStore.isAuthenticated });
		})();

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	// Global Escape key handler to close the top-most overlay (dropdowns, modals, etc.)
	useHotkey('global.escape', 'Escape', 'Close top-most overlay', () => {
		if (overlayStore.count > 0) {
			overlayStore.closeTopMost();
			return true;
		}
		return false;
	});
</script>

<AppHead />

<div class="flex flex-col h-dvh w-full">
	<ClassificationBanner />
	<div class="flex-1 min-h-0 w-full overflow-hidden">
		{@render children?.()}
	</div>
	<ClassificationBanner position="bottom" />
</div>

<FeatureLoginModal
	providers={data.providers}
	open={loginModalStore.isOpen}
	onOpenChange={(open) => {
		if (!open && loginModalStore.current?.action !== 'session_expired') {
			loginModalStore.hide();
		}
	}}
	documentName={loginModalStore.current?.documentName}
	action={loginModalStore.current?.action ?? 'publish'}
/>

<!-- Toast notifications -->
<Toast position="bottom-right" />
