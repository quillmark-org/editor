<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	const browser = typeof window !== 'undefined';
	import { CircleAlert, MapPin, Lightbulb, TriangleAlert } from 'lucide-svelte';
	import { resultToBlob, resultToSVGPages } from '$lib/utils/render-result.js';
	import { getQuillmarkContext } from '$lib/context.js';
	import type { RenderSession, QuillmarkDiagnostic } from '$lib/types.js';
	import { extractSvgDimensions, buildSvgSrcdoc } from '$lib/utils/svg';

	const bindings = getQuillmarkContext();

	function isDiagnosticError(err: unknown): err is { message: string; diagnostics?: QuillmarkDiagnostic[]; diagnostic?: QuillmarkDiagnostic } {
		return Boolean(err && typeof err === 'object' && 'message' in err);
	}

	interface Props {
		/** Markdown content to preview */
		markdown: string;
		/** Pre-parsed quill name from parent (avoids duplicate parsing) */
		quillName?: string | null;
		/** Callback when preview success status changes */
		onPreviewStatusChange?: (hasSuccessfulPreview: boolean) => void;
		/** Callback when user clicks on the preview (to guide them to editor) */
		onPreviewClick?: () => void;
	}

	let { markdown, quillName, onPreviewStatusChange, onPreviewClick }: Props = $props();

	interface ErrorDisplayState {
		message: string;
		diagnostics: QuillmarkDiagnostic[];
	}

	// State
	let loading = $state(false);
	let errorDisplay = $state<ErrorDisplayState | null>(null);

	// Canvas path — only updated on successful renders
	let lastSuccessfulSession = $state<RenderSession | null>(null);

	// SVG/PDF fallback path — used when session.supportsCanvas is false
	let lastSuccessfulSvgPages = $state<string[]>([]);
	let lastSuccessfulPdfUrl = $state<string | null>(null);
	let pdfObjectUrl = $state<string | null>(null);

	// Warnings from the last successful render
	let lastSuccessfulWarnings = $state<QuillmarkDiagnostic[]>([]);

	let currentRenderId = 0;
	let previewContainer = $state<HTMLElement | null>(null);

	let hasSuccessfulPreview = $derived(
		lastSuccessfulSession !== null ||
		lastSuccessfulSvgPages.length > 0 ||
		lastSuccessfulPdfUrl !== null
	);

	let isDarkMode = $state(false);
	let themeObserver: MutationObserver | null = null;

	let isHolding = $state(false);
	let holdTimer: ReturnType<typeof setTimeout> | null = null;

	function onTouchStart() {
		holdTimer = setTimeout(() => { isHolding = true; }, 200);
	}

	function onTouchEnd() {
		if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
		isHolding = false;
	}

	$effect(() => {
		if (onPreviewStatusChange) {
			onPreviewStatusChange(hasSuccessfulPreview);
		}
	});

	function extractErrorDisplay(error: unknown): ErrorDisplayState {
		if (isDiagnosticError(error)) {
			if (Array.isArray(error.diagnostics) && error.diagnostics.length > 0) {
				return { message: error.message, diagnostics: error.diagnostics };
			}
			if (error.diagnostic) {
				return { message: error.message, diagnostics: [error.diagnostic] };
			}
			return { message: error.message, diagnostics: [] };
		}

		if (error instanceof TypeError) {
			console.error('TypeError in preview render:', error);
			return {
				message: 'Preview service error. Try a hard refresh.',
				diagnostics: [
					{
						severity: 'error',
						message: error.message,
						hint: 'Clear browser cache and refresh.',
						sourceChain: []
					} as unknown as QuillmarkDiagnostic
				]
			};
		}

		const message = error instanceof Error ? error.message : 'An unexpected error occurred while rendering';
		console.error('Unexpected error in preview render:', error);
		return { message, diagnostics: [] };
	}

	function revokePdfUrls() {
		if (pdfObjectUrl) { URL.revokeObjectURL(pdfObjectUrl); pdfObjectUrl = null; }
		if (lastSuccessfulPdfUrl) { URL.revokeObjectURL(lastSuccessfulPdfUrl); lastSuccessfulPdfUrl = null; }
	}

	// Svelte action: paint a single page of a RenderSession into a canvas element.
	// Repaints on container resize (RAF-debounced) so the canvas fills the available width.
	function paintPage(canvas: HTMLCanvasElement, params: { session: RenderSession; page: number }) {
		let current = params;
		let ro: ResizeObserver | null = null;
		let rafId: number | null = null;

		function doPaint() {
			const parent = canvas.parentElement;
			if (!parent) return;
			const w = parent.clientWidth;
			if (w === 0) return;
			try {
				const size = current.session.pageSize(current.page);
				const layoutScale = w / size.widthPt;
				const ctx = canvas.getContext('2d');
				if (!ctx) return;
				const result = current.session.paint(ctx, current.page, {
					layoutScale,
					densityScale: window.devicePixelRatio
				});
				canvas.style.width = result.layoutWidth + 'px';
				canvas.style.height = result.layoutHeight + 'px';
			} catch (e) {
				console.error('[preview] canvas paint error:', e);
			}
		}

		function scheduleRepaint() {
			if (rafId !== null) cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => { rafId = null; doPaint(); });
		}

		function reserveSlot() {
			// Set aspect-ratio from page geometry before the first paint so the
			// browser never shows the default 300×150 canvas placeholder size.
			try {
				const size = current.session.pageSize(current.page);
				canvas.style.aspectRatio = `${size.widthPt} / ${size.heightPt}`;
				canvas.style.width = '100%';
			} catch {}
		}

		reserveSlot();
		doPaint();
		ro = new ResizeObserver(scheduleRepaint);
		if (canvas.parentElement) ro.observe(canvas.parentElement);

		return {
			update(p: { session: RenderSession; page: number }) {
				if (p.session === current.session && p.page === current.page) return;
				current = p;
				reserveSlot();
				doPaint();
			},
			destroy() {
				ro?.disconnect();
				if (rafId !== null) cancelAnimationFrame(rafId);
			}
		};
	}

	async function renderPreview(md: string, qn: string | null | undefined): Promise<void> {
		const renderId = ++currentRenderId;

		if (!bindings.isReady) return;

		if (!md) {
			errorDisplay = null;
			lastSuccessfulSession?.free();
			lastSuccessfulSession = null;
			lastSuccessfulSvgPages = [];
			revokePdfUrls();
			lastSuccessfulWarnings = [];
			return;
		}

		// Each render owns its timer — no shared state that concurrent renders clobber.
		const timerHandle = setTimeout(() => {
			if (currentRenderId === renderId) loading = true;
		}, 500);
		errorDisplay = null;

		let newSession: RenderSession | null = null;
		let sessionConsumed = false;

		try {
			newSession = await bindings.openSession(md);

			if (renderId !== currentRenderId) {
				newSession.free();
				return;
			}

			if (newSession.supportsCanvas) {
				// Canvas path — keep session alive for painting
				const prev = lastSuccessfulSession;
				lastSuccessfulSession = newSession;
				sessionConsumed = true;
				lastSuccessfulWarnings = newSession.warnings;

				lastSuccessfulSvgPages = [];
				revokePdfUrls();

				prev?.free();
			} else {
				// Fallback: render to bytes using session.render()
				let format: 'svg' | 'pdf' = 'svg';
				if (qn) {
					try {
						const info = bindings.getQuillInfo(qn);
						if (!info.supportedFormats.includes('svg') && info.supportedFormats.includes('pdf')) {
							format = 'pdf';
						}
					} catch { /* default to svg */ }
				}

				const result = newSession.render({ format });
				newSession.free();
				sessionConsumed = true;

				const prev = lastSuccessfulSession;
				lastSuccessfulSession = null;
				prev?.free();

				lastSuccessfulWarnings = result.warnings;

				if (result.outputFormat === 'svg') {
					lastSuccessfulSvgPages = resultToSVGPages(result);
					revokePdfUrls();
				} else if (result.outputFormat === 'pdf') {
					lastSuccessfulSvgPages = [];
					if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
					const blob = resultToBlob(result);
					pdfObjectUrl = URL.createObjectURL(blob);
					if (lastSuccessfulPdfUrl) URL.revokeObjectURL(lastSuccessfulPdfUrl);
					lastSuccessfulPdfUrl = pdfObjectUrl;
				} else {
					lastSuccessfulSvgPages = [];
					revokePdfUrls();
				}
			}

			errorDisplay = null;
		} catch (err) {
			if (!sessionConsumed) newSession?.free();
			errorDisplay = extractErrorDisplay(err);
		} finally {
			clearTimeout(timerHandle);
			if (currentRenderId === renderId) loading = false;
		}
	}

	function initializeService(): void {
		if (!bindings.isReady) {
			loading = true;
		}
	}

	$effect(() => {
		const md = markdown;
		const qn = quillName;
		if (browser) {
			renderPreview(md, qn);
		}
	});

	onMount(async () => {
		await initializeService();
		if (bindings.isReady) {
			renderPreview(markdown, quillName);
		}

		if (browser && previewContainer) {
			isDarkMode = previewContainer.closest('.qm-dark') != null;
			themeObserver = new MutationObserver(() => {
				isDarkMode = previewContainer?.closest('.qm-dark') != null;
			});
			themeObserver.observe(document.documentElement, {
				attributes: true,
				subtree: true,
				attributeFilter: ['class']
			});
		}
	});

	onDestroy(() => {
		if (themeObserver) themeObserver.disconnect();
		if (holdTimer) clearTimeout(holdTimer);
		lastSuccessfulSession?.free();
		if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
		if (lastSuccessfulPdfUrl) URL.revokeObjectURL(lastSuccessfulPdfUrl);
	});
</script>

<div class="relative h-full w-full bg-background" bind:this={previewContainer}>
	<div
		class="preview-wrapper h-full w-full overflow-auto"
		role="region"
		aria-label="Document preview"
		aria-live="polite"
		aria-busy={loading}
	>
	{#if loading}
		<div class="flex h-full items-center justify-center p-2">
			<div class="text-center">
				<div class="preview-loading-spinner mb-4"></div>
				<p class="text-muted-foreground">Rendering preview...</p>
			</div>
		</div>
	{:else}
		<!-- Content layer: always shows the last successful render, dimmed when there's an error -->
		{#if lastSuccessfulSession && lastSuccessfulSession.pageCount > 0}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="preview-canvas-container"
				class:preview-comfort-active={isDarkMode && !isHolding && !errorDisplay}
				class:opacity-30={!!errorDisplay}
				class:blur-sm={!!errorDisplay}
				class:pointer-events-none={!!errorDisplay}
				ontouchstart={onTouchStart}
				ontouchend={onTouchEnd}
				ontouchcancel={onTouchEnd}
			>
				{#each { length: lastSuccessfulSession.pageCount } as _, i (i)}
					<div class="preview-canvas-page">
						<canvas use:paintPage={{ session: lastSuccessfulSession, page: i }}></canvas>
						{#if !errorDisplay}
							<button type="button" class="preview-canvas-mask" onclick={onPreviewClick} aria-label="Edit document"></button>
						{/if}
					</div>
				{/each}
			</div>
		{:else if lastSuccessfulSvgPages.length > 0}
			<!-- SVG fallback -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="preview-svg-container"
				class:preview-comfort-active={isDarkMode && !isHolding && !errorDisplay}
				class:opacity-30={!!errorDisplay}
				class:blur-sm={!!errorDisplay}
				class:pointer-events-none={!!errorDisplay}
				ontouchstart={onTouchStart}
				ontouchend={onTouchEnd}
				ontouchcancel={onTouchEnd}
			>
				{#each lastSuccessfulSvgPages as page, index (index)}
					{@const dims = extractSvgDimensions(page)}
					<div class="preview-svg-page">
						<div class="relative w-full">
							<iframe
								title="Page {index + 1} preview"
								srcdoc={buildSvgSrcdoc(page)}
								sandbox=""
								class="preview-svg-iframe"
								style="aspect-ratio: {dims.width} / {dims.height};"
							></iframe>
							{#if !errorDisplay}
								<button type="button" class="preview-iframe-mask" onclick={onPreviewClick} aria-label="Edit document"></button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{:else if lastSuccessfulPdfUrl}
			<!-- PDF fallback -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="relative h-full w-full"
				class:preview-comfort-active={isDarkMode && !isHolding && !errorDisplay}
				class:opacity-30={!!errorDisplay}
				class:blur-sm={!!errorDisplay}
				class:pointer-events-none={!!errorDisplay}
				ontouchstart={onTouchStart}
				ontouchend={onTouchEnd}
				ontouchcancel={onTouchEnd}
			>
				<iframe
					src={lastSuccessfulPdfUrl}
					title="PDF preview"
					class="h-full w-full border-0"
					aria-label="PDF preview"
				></iframe>
				{#if !errorDisplay}
					<button type="button" class="preview-iframe-mask" onclick={onPreviewClick} aria-label="Edit document"></button>
				{/if}
			</div>
		{/if}

		<!-- Warnings overlay (success state only) -->
		{#if !errorDisplay && lastSuccessfulWarnings.length > 0}
			<div class="absolute top-0 right-0 z-10 p-4 max-w-md">
				<div class="rounded-lg border border-warning-border bg-warning-background/90 p-4 shadow-lg backdrop-blur-sm">
					<div class="mb-2 flex items-center gap-2">
						<TriangleAlert class="h-5 w-5 text-warning" aria-hidden="true" />
						<h3 class="font-semibold text-warning-foreground">Warnings</h3>
					</div>
					<div class="space-y-3 max-h-60 overflow-y-auto">
						{#each lastSuccessfulWarnings as diagnostic, index (index)}
							<div class="text-sm">
								<p class="text-warning-foreground font-medium">{diagnostic.message}</p>
								{#if diagnostic.hint}
									<p class="text-warning-foreground/80 mt-1 italic">Hint: {diagnostic.hint}</p>
								{/if}
								{#if diagnostic.location}
									<p class="text-warning-foreground/70 text-xs mt-1 font-mono">
										Line {diagnostic.location.line}, Col {diagnostic.location.column}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		<!-- Error overlay -->
		{#if errorDisplay}
			<div
				class="absolute inset-0 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
			>
				<div
					class="max-w-2xl rounded-lg border border-error-border bg-error-background p-6 shadow-xl max-h-[80vh] overflow-y-auto"
				>
					<!-- Header Summary -->
					<div class="mb-4 flex items-center gap-2 border-b border-error-border pb-4">
						<CircleAlert class="h-6 w-6 text-error shrink-0" aria-hidden="true" />
						<div>
							<h3 class="text-lg font-semibold text-error-foreground">Render Error</h3>
							{#if errorDisplay.diagnostics.length > 1}
								<p class="text-sm text-muted-foreground">
									{errorDisplay.diagnostics.length} issues found
								</p>
							{/if}
						</div>
					</div>

					<!-- Diagnostics List -->
					<div class="space-y-6">
						{#each errorDisplay.diagnostics as diagnostic, index (index)}
							<div class="diagnostic-item {index > 0 ? 'border-t border-error-border/50 pt-4' : ''}">
								<!-- Error Code & Severity -->
								<div class="mb-2 flex items-center gap-2">
									{#if diagnostic.code}
										<span
											class="inline-block rounded bg-error-border px-2 py-1 font-mono text-xs text-error-foreground"
										>
											{diagnostic.code}
										</span>
									{/if}
									{#if diagnostic.severity && diagnostic.severity !== 'error'}
										<span class="text-xs uppercase text-muted-foreground font-bold text-[10px] tracking-wider border border-current px-1 rounded-sm opacity-70">
											{diagnostic.severity}
										</span>
									{/if}
								</div>

								<!-- Error Message -->
								<p class="mb-3 text-error-foreground font-medium">
									{diagnostic.message}
								</p>

								<!-- Location -->
								{#if diagnostic.location}
									<div class="mb-3 flex items-center gap-2 text-sm text-muted-foreground bg-background/50 p-1.5 rounded w-fit">
										<MapPin class="h-4 w-4" aria-hidden="true" />
										<span class="font-mono">
											Line {diagnostic.location.line}, Column {diagnostic.location.column}
										</span>
									</div>
								{/if}

								<!-- Hint -->
								{#if diagnostic.hint}
									<div
										class="mb-3 flex gap-2 rounded border-l-4 border-warning bg-warning-background p-3"
									>
										<Lightbulb class="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
										<p class="text-sm text-warning-foreground">
											{diagnostic.hint}
										</p>
									</div>
								{/if}

								<!-- Source Chain -->
								{#if diagnostic.sourceChain && diagnostic.sourceChain.length > 0}
									<details class="text-sm">
										<summary
											class="cursor-pointer font-medium text-muted-foreground hover:text-foreground select-none"
										>
											Error details
										</summary>
										<ul class="mt-2 list-disc space-y-1 pl-5 text-muted-foreground/80">
											{#each diagnostic.sourceChain as source, idx (idx)}
												<li>{source}</li>
											{/each}
										</ul>
									</details>
								{/if}
							</div>
						{/each}

						{#if errorDisplay.diagnostics.length === 0}
							<p class="text-error-foreground">{errorDisplay.message}</p>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	{/if}

	</div>
</div>

<style>
	.preview-wrapper {
		position: relative;
	}

	.preview-canvas-container {
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		min-height: 100%;
	}

	.preview-canvas-page {
		position: relative;
		display: flex;
		justify-content: center;
		width: 100%;
	}

	.preview-canvas-page canvas {
		display: block;
		max-width: 100%;
		box-shadow: 0 0 4px 1px var(--qm-foreground-shadow);
	}

	.preview-canvas-mask {
		position: absolute;
		inset: 0;
		background: transparent;
		z-index: 5;
		cursor: default;
	}

	.preview-svg-container {
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		min-height: 100%;
	}

	.preview-svg-page {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		width: 100%;
		max-width: 100%;
	}

	.preview-svg-iframe {
		width: 100%;
		max-width: 100%;
		height: auto;
		border: none;
		box-shadow: 0 0 4px 1px var(--qm-foreground-shadow);
		background: white;
	}

	.preview-iframe-mask {
		position: absolute;
		inset: 0;
		background: transparent;
		z-index: 5;
		cursor: default;
	}

	.preview-comfort-active {
		filter: brightness(0.863) saturate(0.8);
		transition: filter 2.4s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.preview-comfort-active:hover {
		filter: brightness(1) saturate(1);
	}

	.preview-loading-spinner {
		display: inline-block;
		width: 2rem;
		height: 2rem;
		border: 4px solid var(--qm-primary);
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
