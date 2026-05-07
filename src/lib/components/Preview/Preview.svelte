<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { CircleAlert, MapPin, Lightbulb, TriangleAlert } from 'lucide-svelte';
	import { quillmarkService, resultToBlob, resultToSVGPages } from '$lib/services/quillmark';
	import {
		QuillmarkError,
		type RenderResult,
		type QuillmarkDiagnostic
	} from '$lib/services/quillmark/types';
	import RulerOverlay from '$lib/components/RulerOverlay/RulerOverlay.svelte';
	import { extractSvgDimensions, buildSvgSrcdoc } from '$lib/utils/svg';

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

	// Use QuillmarkDiagnostic directly for state
	interface ErrorDisplayState {
		message: string; // Top-level summary message
		diagnostics: QuillmarkDiagnostic[];
	}

	// State
	let loading = $state(false);
	let errorDisplay = $state<ErrorDisplayState | null>(null);
	let renderResult = $state<RenderResult | null>(null);
	let lastSuccessfulResult = $state<RenderResult | null>(null);
	let pdfObjectUrl = $state<string | null>(null);
	let lastSuccessfulPdfUrl = $state<string | null>(null);
	let svgPages = $state<string[]>([]);
	let lastSuccessfulSvgPages = $state<string[]>([]);

	// Track latest render ID for cancellation (plain variable — not reactive,
	// since it's only used inside renderPreview() for async cancellation)
	let currentRenderId = 0;

	// Container element for ruler overlay
	let previewContainer = $state<HTMLElement | null>(null);

	// Derived state: whether we have a successful preview
	let hasSuccessfulPreview = $derived(lastSuccessfulResult !== null);

	// Dark mode tracking for comfort mode
	let isDarkMode = $state(false);
	let themeObserver: MutationObserver | null = null;

	// Touch-hold state for mobile undim
	let isHolding = $state(false);
	let holdTimer: ReturnType<typeof setTimeout> | null = null;

	function onTouchStart() {
		holdTimer = setTimeout(() => {
			isHolding = true;
		}, 200);
	}

	function onTouchEnd() {
		if (holdTimer) {
			clearTimeout(holdTimer);
			holdTimer = null;
		}
		isHolding = false;
	}

	// Notify parent when preview status changes
	$effect(() => {
		if (onPreviewStatusChange) {
			onPreviewStatusChange(hasSuccessfulPreview);
		}
	});

	/**
	 * Extract error display information from caught error
	 */
	function extractErrorDisplay(error: unknown): ErrorDisplayState {
		if (error instanceof QuillmarkError && error.diagnostics && error.diagnostics.length > 0) {
			return {
				message: error.message,
				diagnostics: error.diagnostics
			};
		}

		if (error instanceof QuillmarkError && error.diagnostic) {
			return {
				message: error.message,
				diagnostics: [error.diagnostic]
			};
		}

		if (error instanceof QuillmarkError) {
			return { 
				message: error.message,
				diagnostics: []
			};
		}

		// Handle TypeError specifically - often indicates a stale cache
		if (error instanceof TypeError) {
			console.error('TypeError in preview render (try hard refresh):', error);
			return {
				message: 'Preview service error. Please try a hard refresh (Cmd+Shift+R or Ctrl+Shift+R).',
				diagnostics: [{
					severity: 'error',
					message: error.message,
					hint: 'Try clearing your browser cache and refreshing the page.',
					sourceChain: []
				}]
			};
		}

		console.error('Unexpected error type in preview render:', error);

		return { 
			message: 'An unexpected error occurred while rendering',
			diagnostics: []
		};
	}


	// Loading delay timer
	let loadingTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * Render markdown using Quillmark service.
	 *
	 * Accepts explicit md/qn parameters so values are captured at call time
	 * (inside the $effect that tracks the reactive props), preventing stale
	 * reads during async execution.
	 */
	async function renderPreview(md: string, qn: string | null | undefined): Promise<void> {
		const renderId = ++currentRenderId;

		// Keep showing loading screen while service initializes
		if (!quillmarkService.isReady()) {
			return;
		}

		if (!md) {
			renderResult = null;
			svgPages = [];
			// Clean up PDF object URL when clearing
			if (pdfObjectUrl) {
				URL.revokeObjectURL(pdfObjectUrl);
				pdfObjectUrl = null;
			}
			return;
		}

		// Clear any existing loading timer to prevent race conditions
		if (loadingTimer) {
			clearTimeout(loadingTimer);
			loadingTimer = null;
		}

		// Start a timer to show loading spinner only if render takes too long
		loadingTimer = setTimeout(() => {
			loading = true;
		}, 500);

		errorDisplay = null;

		try {
			let preferredFormat: 'svg' | 'pdf' = 'svg';

			// Use the captured quillName to check formats.
			// Format support rarely changes between versions, and the engine will
			// natively use the accurate quill version based on the markdown content.
			if (qn) {
				try {
					await quillmarkService.ensureQuillResolved(qn);
					const info = quillmarkService.getQuillInfo(qn);
					// Prefer SVG for preview, fall back to PDF if SVG not supported
					if (info.supportedFormats.includes('svg')) {
						preferredFormat = 'svg';
					} else if (info.supportedFormats.includes('pdf')) {
						preferredFormat = 'pdf';
					}
				} catch {
					// If getQuillInfo fails, default to SVG
					// This can happen during rapid typing if the quill name is temporarily invalid
				}
			}

			// Render with the preferred format
			const result = await quillmarkService.render(md, preferredFormat);
			
			// Check if this render was cancelled by a newer one
			if (renderId !== currentRenderId) {
				return;
			}

			renderResult = result;

			// Clean up previous PDF object URL before creating new one
			if (pdfObjectUrl) {
				URL.revokeObjectURL(pdfObjectUrl);
				pdfObjectUrl = null;
			}

			// Process output based on format
			if (result.outputFormat === 'svg') {
				svgPages = resultToSVGPages(result);
			} else if (result.outputFormat === 'pdf') {
				// Create new object URL for PDF only on new render
				svgPages = [];
				const blob = resultToBlob(result);
				pdfObjectUrl = URL.createObjectURL(blob);
			} else {
				svgPages = [];
			}

			// Save successful render state
			lastSuccessfulResult = result;
			lastSuccessfulSvgPages = svgPages;
			if (pdfObjectUrl) {
				// Clean up old successful PDF URL
				if (lastSuccessfulPdfUrl) {
					URL.revokeObjectURL(lastSuccessfulPdfUrl);
				}
				lastSuccessfulPdfUrl = pdfObjectUrl;
			}

			// Clear error on successful render
			errorDisplay = null;
		} catch (err) {
			errorDisplay = extractErrorDisplay(err);
		} finally {
			// Clear the loading timer if it hasn't fired yet
			if (loadingTimer) {
				clearTimeout(loadingTimer);
				loadingTimer = null;
			}
			loading = false;
		}
	}

	/**
	 * Initialize Quillmark service
	 */
	async function initializeService(): Promise<void> {
		if (!quillmarkService.isReady()) {
			try {
				loading = true;
				await quillmarkService.initialize();
			} catch (err) {
				errorDisplay = {
					message: 'Failed to initialize preview. Please refresh.',
					diagnostics: []
				};
				console.error('Quillmark initialization failed:', err);
			} finally {
				loading = false;
			}
		}
	}

	/**
	 * Trigger render when markdown or quillName changes.
	 *
	 * Values are captured inside the effect (where Svelte tracks reactive reads)
	 * and passed as parameters to renderPreview(), preventing stale reads during
	 * async execution. The parent's debouncedContent provides 50ms debouncing.
	 */
	$effect(() => {
		const md = markdown;
		const qn = quillName;

		if (browser) {
			renderPreview(md, qn);
		}
	});

	onMount(async () => {
		await initializeService();
		// After initialization, trigger an initial render since the $effect
		// that tracks markdown/quillName may have already run (and returned early
		// because the service wasn't ready yet).
		if (quillmarkService.isReady()) {
			renderPreview(markdown, quillName);
		}

		// Dark mode observer
		if (browser) {
			isDarkMode = document.documentElement.classList.contains('dark');
			themeObserver = new MutationObserver((mutations) => {
				for (const mutation of mutations) {
					if (mutation.attributeName === 'class') {
						isDarkMode = document.documentElement.classList.contains('dark');
					}
				}
			});
			themeObserver.observe(document.documentElement, { attributes: true });
		}
	});

	onDestroy(() => {
		if (themeObserver) {
			themeObserver.disconnect();
		}
		if (holdTimer) {
			clearTimeout(holdTimer);
		}
		// Clean up PDF object URLs
		if (pdfObjectUrl) {
			URL.revokeObjectURL(pdfObjectUrl);
		}
		if (lastSuccessfulPdfUrl) {
			URL.revokeObjectURL(lastSuccessfulPdfUrl);
		}
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
	{:else if errorDisplay}
		<!-- Show error overlay with last successful render in background -->
		<div class="relative h-full">
			<!-- Background: Last successful render (dimmed) -->
			{#if lastSuccessfulResult?.outputFormat === 'svg' && lastSuccessfulSvgPages.length > 0}
				<div class="preview-svg-container opacity-30 blur-sm">
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
								<button type="button" class="preview-iframe-mask" onclick={onPreviewClick} aria-label="Edit document"></button>
							</div>
						</div>
					{/each}
				</div>
			{:else if lastSuccessfulResult?.outputFormat === 'pdf' && lastSuccessfulPdfUrl}
				<div class="relative h-full w-full">
					<iframe
						src={lastSuccessfulPdfUrl}
						title="PDF preview (last successful)"
						class="h-full w-full border-0 opacity-30 blur-sm"
						aria-label="PDF preview"
					></iframe>
					<button type="button" class="preview-iframe-mask" onclick={onPreviewClick} aria-label="Edit document"></button>
				</div>
			{/if}

			<!-- Foreground: Error overlay -->
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
		</div>
	{:else if renderResult?.outputFormat === 'svg' && svgPages.length > 0}
		<div class="relative h-full">
			<!-- Diagnostics Overlay (Warnings/Hints) -->
			{#if renderResult.warnings && renderResult.warnings.length > 0}
				<div class="absolute top-0 right-0 z-10 p-4 max-w-md">
					<div class="rounded-lg border border-warning-border bg-warning-background/90 p-4 shadow-lg backdrop-blur-sm">
						<div class="mb-2 flex items-center gap-2">
							<TriangleAlert class="h-5 w-5 text-warning" aria-hidden="true" />
							<h3 class="font-semibold text-warning-foreground">Warnings</h3>
						</div>
						<div class="space-y-3 max-h-60 overflow-y-auto">
							{#each renderResult.warnings as diagnostic, index (index)}
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

			<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="preview-svg-container"
			class:preview-comfort-active={isDarkMode && !isHolding}
			ontouchstart={onTouchStart}
			ontouchend={onTouchEnd}
			ontouchcancel={onTouchEnd}
		>
				{#each svgPages as page, index (index)}
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
							<button type="button" class="preview-iframe-mask" onclick={onPreviewClick} aria-label="Edit document"></button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else if renderResult?.outputFormat === 'pdf' && pdfObjectUrl}
		<div class="h-full px-2 relative">
             <!-- Diagnostics Overlay (Warnings/Hints) for PDF -->
			{#if renderResult.warnings && renderResult.warnings.length > 0}
				<div class="absolute top-0 right-4 z-10 p-4 max-w-md">
					<div class="rounded-lg border border-warning-border bg-warning-background/90 p-4 shadow-lg backdrop-blur-sm">
						<div class="mb-2 flex items-center gap-2">
							<TriangleAlert class="h-5 w-5 text-warning" aria-hidden="true" />
							<h3 class="font-semibold text-warning-foreground">Warnings</h3>
						</div>
						<div class="space-y-3 max-h-60 overflow-y-auto">
							{#each renderResult.warnings as diagnostic, index (index)}
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

			<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative h-full w-full"
			class:preview-comfort-active={isDarkMode && !isHolding}
			ontouchstart={onTouchStart}
			ontouchend={onTouchEnd}
			ontouchcancel={onTouchEnd}
		>
				<iframe
					src={pdfObjectUrl}
					title="PDF preview"
					class="h-full w-full border-0"
					aria-label="PDF preview"
				></iframe>
				<button type="button" class="preview-iframe-mask" onclick={onPreviewClick} aria-label="Edit document"></button>
			</div>
		</div>
	{/if}

	</div>

	<!-- Ruler Overlay -->
	<RulerOverlay containerElement={previewContainer} />
</div>

<style>
	.preview-wrapper {
		position: relative;
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
		box-shadow: 0 0 4px 1px var(--color-foreground-shadow);
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
		border: 4px solid var(--color-primary);
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
