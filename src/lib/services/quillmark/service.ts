/**
 * Quillmark Service Implementation (browser singleton)
 *
 * Wraps @quillmark/wasm 0.64 (Document model) and @quillmark/quiver to render
 * markdown documents to PDF/SVG/PNG. Loads the packaged Quiver from
 * `/quills/` (SSR-bundled manifest preseeds `getAvailableQuills()`).
 *
 * Schemas come straight off the wasm Quill via `quill.schema`. We do not
 * parse `Quill.yaml` ourselves and we do not project per-doc — both
 * `main.fields` and `card_types[tag].fields` are static metadata exposed by
 * the engine.
 *
 * Async resolution delegates to `quiver.getQuill(ref, { engine })`, which
 * canonicalizes selector refs, materializes the Quill via `engine.quill(tree)`,
 * caches per (engine, canonical-ref), and coalesces concurrent loads. We keep
 * a sync `Map<canonical, { quill, info }>` populated alongside it so render-
 * phase consumers can read `quill.metadata` from `$derived` without awaiting.
 */

import { ClientService } from '../base';
import type {
	QuillmarkService,
	QuillManifest,
	QuillMetadata,
	QuillInfo,
	Quill,
	RenderFormat,
	RenderResult,
	RenderOptions,
	Document
} from './types';
import { QuillmarkError } from './types';
import { getErrorMessage } from '$lib/errors';
import { extractDiagnostics } from './diagnostic-utils';
import { collectDatePaths, type QuillSchemaDatePaths } from '$lib/parsing/quill-schema-date-paths';

class QuillmarkServiceImpl extends ClientService<QuillmarkServiceImpl> implements QuillmarkService {
	private engine: InstanceType<typeof import('@quillmark/wasm').Quillmark> | null = null;
	private quiver: import('@quillmark/quiver').Quiver | null = null;
	private DocumentClass: typeof import('@quillmark/wasm').Document | null = null;
	private manifest: QuillManifest | null = null;

	/** canonical-ref → resolved Quill + derived info. Populated by `ensureQuillResolved`. */
	private resolvedQuills = new Map<string, { quill: Quill; info: QuillInfo }>();
	/** input-ref (selector or canonical) → canonical-ref. Sync lookup for getQuill. */
	private canonicalRefByInput = new Map<string, string>();

	public constructor() {
		super();
	}

	/**
	 * Initialize manifest from SSR data. Called in the root layout before any
	 * component reads `getAvailableQuills()`.
	 */
	initializeWithManifest(quills: QuillMetadata[]): void {
		this.manifest = { quills };
	}

	protected async doInitialize(): Promise<void> {
		if (!this.manifest) {
			throw new QuillmarkError(
				'not_initialized',
				'Quillmark manifest not initialized. Call initializeWithManifest() with SSR data before initialize().'
			);
		}

		const [wasmModule, { Quiver }] = await Promise.all([
			import('@quillmark/wasm'),
			import('@quillmark/quiver')
		]);

		if (wasmModule.init) wasmModule.init();

		this.DocumentClass = wasmModule.Document;
		this.engine = new wasmModule.Quillmark();
		const quiver = await Quiver.fromBuiltUrl('/quills/');
		this.quiver = quiver;

		// Background-prefetch every quill tree; subsequent getQuill calls hit cache.
		quiver.warm().catch((err) => {
			console.warn('[Quillmark] Quiver prefetch failed:', err);
		});

		console.log('[Quillmark] WASM engine + Quiver initialized:', quiver.quillNames().join(', '));
	}

	isReady(): boolean {
		return super.isReady() && this.engine !== null && this.quiver !== null;
	}

	/** Wasm `Document` constructor — only valid after `initialize()` resolves. */
	get Document(): typeof import('@quillmark/wasm').Document {
		this.validateInitialized();
		return this.DocumentClass!;
	}

	getAvailableQuills(): QuillMetadata[] {
		this.validateInitialized();
		return this.manifest?.quills ?? [];
	}

	getQuillInfo(quillRef: string): QuillInfo {
		return this.requireResolved(quillRef).info;
	}

	getQuill(quillRef: string): Quill {
		return this.requireResolved(quillRef).quill;
	}

	private requireResolved(quillRef: string): { quill: Quill; info: QuillInfo } {
		this.validateInitialized();
		const canonical = this.canonicalRefByInput.get(quillRef);
		const cached = canonical ? this.resolvedQuills.get(canonical) : undefined;
		if (!cached) {
			throw new QuillmarkError(
				'quill_not_found',
				`Quill '${quillRef}' has not been resolved. Call ensureQuillResolved() first.`
			);
		}
		return cached;
	}

	/**
	 * Resolve and materialize a quill. Delegates to `quiver.getQuill(ref, {
	 * engine })`, which canonicalizes the selector, fetches/caches the tree,
	 * materializes via `engine.quill(tree)`, and coalesces concurrent loads
	 * for the same ref. We mirror the resolved Quill into a sync map so
	 * render-phase consumers can read `quill.metadata` without awaiting.
	 */
	async ensureQuillResolved(quillRef: string): Promise<void> {
		this.validateInitialized();
		if (!quillRef) return;

		const known = this.canonicalRefByInput.get(quillRef);
		if (known && this.resolvedQuills.has(known)) return;

		const quiver = this.quiver!;
		const quill = (await quiver.getQuill(quillRef, {
			engine: this.engine! as unknown as Parameters<typeof quiver.getQuill>[1]['engine']
		})) as Quill;
		const canonical = await this.quiver!.resolve(quillRef);

		if (!this.resolvedQuills.has(canonical)) {
			const [name, version] = canonical.split('@');
			const { supportedFormats } = quill.metadata;
			const quillSchema = quill.schema;
			const info: QuillInfo = {
				name,
				version,
				description: quillSchema.main.description,
				supportedFormats,
				cardTypes: Object.freeze(Object.keys(quillSchema.card_types ?? {}))
			};
			this.resolvedQuills.set(canonical, { quill, info });
		}
		this.canonicalRefByInput.set(quillRef, canonical);
		this.canonicalRefByInput.set(canonical, canonical);
	}

	parseDocument(markdown: string): Document {
		this.validateInitialized();
		try {
			return this.DocumentClass!.fromMarkdown(markdown);
		} catch (error) {
			throw toQuillmarkError(error, 'render_error', 'Failed to parse markdown');
		}
	}

	async getDatePathConfigForMarkdown(markdown: string): Promise<QuillSchemaDatePaths | null> {
		this.validateInitialized();
		let doc: Document | null = null;
		try {
			doc = this.parseDocument(markdown);
			const ref = doc.quillRef;
			if (!ref) return null;
			await this.ensureQuillResolved(ref);
			const { quill } = this.requireResolved(ref);
			return collectDatePaths(quill);
		} catch {
			return null;
		} finally {
			doc?.free();
		}
	}

	async render(
		markdown: string,
		format?: RenderFormat,
		options?: RenderOptions
	): Promise<RenderResult> {
		this.validateInitialized();
		await new Promise((resolve) => setTimeout(resolve, 0));

		let doc: Document | null = null;
		try {
			doc = this.parseDocument(markdown);
			const ref = doc.quillRef;
			if (!ref) {
				throw new QuillmarkError(
					'render_error',
					'Document is missing a QUILL frontmatter directive.'
				);
			}
			await this.ensureQuillResolved(ref);
			const canonical = this.canonicalRefByInput.get(ref);
			const cached = canonical ? this.resolvedQuills.get(canonical) : undefined;
			if (!cached) {
				throw new QuillmarkError('quill_not_found', `Quill '${ref}' could not be resolved.`);
			}

			const renderOptions: { format?: RenderFormat; ppi?: number; pages?: number[] } = {
				...options
			};
			if (format) renderOptions.format = format;

			return cached.quill.render(doc, renderOptions);
		} catch (error) {
			if (error instanceof QuillmarkError) throw error;
			throw toQuillmarkError(error, 'render_error', 'Failed to render preview');
		} finally {
			doc?.free();
		}
	}

	async downloadDocument(markdown: string, filename: string, format: RenderFormat): Promise<void> {
		this.validateInitialized();
		const result = await this.render(markdown, format);
		const blob = resultToBlob(result);

		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	protected validateInitialized(): void {
		super.validateInitialized();
		if (!this.engine || !this.quiver || !this.DocumentClass) {
			throw new QuillmarkError(
				'not_initialized',
				'Quillmark service is not initialized. Call initialize() first.'
			);
		}
	}
}

function toQuillmarkError(
	error: unknown,
	fallbackCode: 'render_error' | 'quill_not_found',
	fallbackMessage: string
): QuillmarkError {
	const diagnostics = extractDiagnostics(error);
	if (diagnostics && diagnostics.length > 0) {
		const first = diagnostics[0];
		let message = first.message;
		if (diagnostics.length > 1) {
			const count = diagnostics.length - 1;
			message += ` (${count} additional diagnostic${count > 1 ? 's' : ''} encountered)`;
		}
		return new QuillmarkError(fallbackCode, message, first, diagnostics);
	}
	return new QuillmarkError(fallbackCode, `${fallbackMessage}: ${getErrorMessage(error)}`);
}

export const quillmarkService = QuillmarkServiceImpl.getInstance();

export function resultToBlob(result: RenderResult): Blob {
	const artifact = result.artifacts[0];
	if (!artifact) {
		throw new Error('Invalid render result: no artifacts');
	}
	return new Blob([artifact.bytes as BlobPart], { type: artifact.mimeType });
}

export function resultToSVGPages(result: RenderResult): string[] {
	if (result.outputFormat !== 'svg') {
		throw new Error('RenderResult is not SVG format');
	}
	const artifacts = result.artifacts;
	if (!Array.isArray(artifacts) || artifacts.length === 0) {
		throw new Error('Invalid render result: artifacts is not an array or is empty');
	}
	const decoder = new TextDecoder('utf-8');
	return result.artifacts.map((artifact) => decoder.decode(artifact.bytes));
}
