/**
 * Reference QuillmarkBindings implementation for the playground.
 *
 * Demonstrates how a consumer constructs and owns the wasm engine, then
 * passes a contract object to <DocumentEditor> via setQuillmarkContext.
 *
 * This file is NOT part of the published @quillmark/editor package — it
 * lives in src/routes (the dev playground), not src/lib.
 */

import type { Document, Quill, Quillmark } from '@quillmark/wasm';
import type {
	QuillmarkBindings,
	QuillmarkDiagnostic,
	QuillInfo,
	RenderFormat,
	RenderOptions,
	RenderResult
} from '$lib/types.js';

class PlaygroundBindings implements QuillmarkBindings {
	private engine: Quillmark | null = null;
	private quiver: import('@quillmark/quiver').Quiver | null = null;
	private DocumentClass: typeof Document | null = null;
	private resolved = new Map<string, { quill: Quill; info: QuillInfo }>();
	private canonicalByRef = new Map<string, string>();
	private inFlight = new Map<string, Promise<void>>();
	#ready = $state(false);

	get isReady(): boolean {
		return this.#ready;
	}

	get Document(): typeof Document {
		if (!this.DocumentClass) throw new Error('Bindings: not initialized');
		return this.DocumentClass;
	}

	async init(): Promise<void> {
		const [wasm, { Quiver }] = await Promise.all([
			import('@quillmark/wasm'),
			import('@quillmark/quiver')
		]);
		if ((wasm as { init?: () => void }).init) {
			(wasm as { init?: () => void }).init!();
		}
		this.DocumentClass = wasm.Document;
		this.engine = new wasm.Quillmark();
		this.quiver = await Quiver.fromBuiltUrl('/quills/');
		this.quiver.warm().catch((err) => console.warn('[playground] quiver warm:', err));
		this.#ready = true;
	}

	parseDocument(markdown: string): Document {
		if (!this.DocumentClass) throw new Error('Bindings: not initialized');
		return this.DocumentClass.fromMarkdown(markdown);
	}

	async ensureQuillResolved(ref: string): Promise<void> {
		if (!this.engine || !this.quiver) throw new Error('Bindings: not initialized');
		if (!ref) return;

		const known = this.canonicalByRef.get(ref);
		if (known && this.resolved.has(known)) return;

		// Coalesce concurrent loads
		let pending = this.inFlight.get(ref);
		if (!pending) {
			pending = (async () => {
				const quill = (await this.quiver!.getQuill(ref, {
					engine: this.engine! as unknown as Parameters<
						typeof this.quiver.getQuill
					>[1]['engine']
				})) as Quill;
				const canonical = await this.quiver!.resolve(ref);
				if (!this.resolved.has(canonical)) {
					const [name, version] = canonical.split('@');
					const { supportedFormats } = quill.metadata;
					const schema = quill.schema;
					const info: QuillInfo = {
						name,
						version,
						description: schema.main.description,
						supportedFormats,
						cardTypes: Object.freeze(Object.keys(schema.card_types ?? {}))
					};
					this.resolved.set(canonical, { quill, info });
				}
				this.canonicalByRef.set(ref, canonical);
				this.canonicalByRef.set(canonical, canonical);
			})();
			this.inFlight.set(ref, pending);
			try {
				await pending;
			} finally {
				this.inFlight.delete(ref);
			}
		} else {
			await pending;
		}
	}

	getQuill(ref: string): Quill {
		const cached = this.lookupResolved(ref);
		return cached.quill;
	}

	getQuillInfo(ref: string): QuillInfo {
		return this.lookupResolved(ref).info;
	}

	private lookupResolved(ref: string): { quill: Quill; info: QuillInfo } {
		const canonical = this.canonicalByRef.get(ref);
		const cached = canonical ? this.resolved.get(canonical) : undefined;
		if (!cached) {
			const err = new Error(
				`Quill '${ref}' has not been resolved. Call ensureQuillResolved() first.`
			);
			throw err;
		}
		return cached;
	}

	async render(
		markdown: string,
		format?: RenderFormat,
		options?: RenderOptions
	): Promise<RenderResult> {
		if (!this.engine) throw new Error('Bindings: not initialized');
		let doc: Document | null = null;
		try {
			doc = this.parseDocument(markdown);
			const ref = doc.quillRef;
			if (!ref) {
				const err: Error & { diagnostics?: QuillmarkDiagnostic[] } = new Error(
					'Missing QUILL directive in document frontmatter.'
				);
				err.diagnostics = [];
				throw err;
			}
			await this.ensureQuillResolved(ref);
			const { quill } = this.lookupResolved(ref);
			return quill.render(doc, { format, ...(options ?? {}) });
		} finally {
			doc?.free();
		}
	}
}

let _instance: PlaygroundBindings | null = null;

export async function createBindings(): Promise<QuillmarkBindings> {
	if (!_instance) {
		_instance = new PlaygroundBindings();
		await _instance.init();
	}
	return _instance;
}
