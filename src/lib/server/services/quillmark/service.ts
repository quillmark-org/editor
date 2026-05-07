/**
 * Server-side Quillmark Service Implementation
 *
 * Singleton wrapping @quillmark/wasm + @quillmark/quiver for serverless
 * (Vercel) and Node deployments.
 *
 * Quiver load strategy:
 *   - Vercel: Quiver.fromBuilt(VERCEL_URL/quills/) — seed is request-triggered
 *     so the deployment is live and routable before it runs.
 *   - Self-hosted: Quiver.fromBuiltDir(QUILLS_DIR) — reads the packed artifact
 *     from disk, avoiding a self-fetch through the load balancer/CDN. Set
 *     QUILLS_DIR to override; defaults to static/quills (dev) or
 *     build/client/quills (production).
 *
 * Schemas come from `quill.schema`. No `Quill.yaml` parsing.
 */

import path from 'node:path';
import { env } from '$env/dynamic/private';
import { getSelfURL } from '$lib/server/utils/api';
import { loadQuillManifestFromStatic } from '$lib/server/quills-manifest';
import { collectDatePaths, type QuillSchemaDatePaths } from '$lib/parsing/quill-schema-date-paths';
type Quillmark = InstanceType<typeof import('@quillmark/wasm').Quillmark>;
type WasmDocument = import('@quillmark/wasm').Document;
type Quill = import('@quillmark/wasm').Quill;
type QuiverInstance = import('@quillmark/quiver').Quiver;

export class QuillmarkServerService {
	private engine: Quillmark | null = null;
	private quiver: QuiverInstance | null = null;
	private DocumentClass: typeof import('@quillmark/wasm').Document | null = null;
	private quillCache = new Map<string, Quill>();

	private static instance: QuillmarkServerService;

	public static getInstance(): QuillmarkServerService {
		if (!QuillmarkServerService.instance) {
			QuillmarkServerService.instance = new QuillmarkServerService();
		}
		return QuillmarkServerService.instance;
	}

	private async ensureEngine(): Promise<void> {
		if (this.engine && this.quiver && this.DocumentClass) return;

		const wasmModule = await import('@quillmark/wasm');
		if (wasmModule.init) wasmModule.init();
		this.DocumentClass = wasmModule.Document;
		this.engine = new wasmModule.Quillmark();

		if (env.VERCEL) {
			const { Quiver } = await import('@quillmark/quiver');
			this.quiver = await Quiver.fromBuiltUrl(`${getSelfURL()}quills/`);
		} else {
			const { Quiver } = await import('@quillmark/quiver/node');
			const quillsDir =
				env.QUILLS_DIR ??
				path.resolve(
					process.env.NODE_ENV === 'production' ? 'build/client/quills' : 'static/quills'
				);
			this.quiver = await Quiver.fromBuiltDir(quillsDir);
		}
	}

	private async loadQuill(quillRef: string): Promise<Quill> {
		const canonical = await this.quiver!.resolve(quillRef);
		const cached = this.quillCache.get(canonical);
		if (cached) return cached;

		const [name, version] = canonical.split('@');
		const tree = await this.quiver!.loadTree(name, version);
		const quill = this.engine!.quill(tree);
		this.quillCache.set(canonical, quill);
		return quill;
	}

	/**
	 * Parse a markdown document and extract its quill reference.
	 * Returns null quillRef if the document has no QUILL frontmatter.
	 */
	public async parseDocument(markdown: string): Promise<{ quillRef: string | null }> {
		await this.ensureEngine();
		let doc: WasmDocument | null = null;
		try {
			doc = this.DocumentClass!.fromMarkdown(markdown);
			return { quillRef: doc.quillRef || null };
		} catch {
			return { quillRef: null };
		} finally {
			doc?.free();
		}
	}

	/**
	 * Check whether a Quill ref resolves against the bundled quiver.
	 * Engine load failures throw; only per-Quill resolution failures return false.
	 */
	public async hasQuill(quillRef: string): Promise<boolean> {
		await this.ensureEngine();
		try {
			await this.loadQuill(quillRef);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Return all available quills with metadata including descriptions from
	 * each quill's form schema. Used by the MCP `list_quills` tool.
	 */
	public async listQuills(): Promise<
		Array<{ name: string; version: string; description?: string }>
	> {
		await this.ensureEngine();
		const manifest = loadQuillManifestFromStatic();
		return Promise.all(
			manifest.quills.map(async ({ name, version }) => {
				try {
					const quill = await this.loadQuill(`${name}@${version}`);
					return {
						name,
						version,
						description: quill.metadata.description as string | undefined
					};
				} catch {
					return { name, version };
				}
			})
		);
	}

	/**
	 * Blueprint accessor for a single quill. Returns the auto-generated
	 * annotated Markdown blueprint for LLM/MCP consumers.
	 */
	public async getQuillBlueprint(quillRef: string): Promise<{
		name: string;
		version: string;
		blueprint: string;
	}> {
		await this.ensureEngine();
		const canonical = await this.quiver!.resolve(quillRef);
		const [name, version] = canonical.split('@');
		const quill = await this.loadQuill(canonical);
		return { name, version, blueprint: quill.blueprint };
	}

	/**
	 * Parse markdown, resolve the quill, and run form projection.
	 * Returns all diagnostics (parse-time warnings + schema validation) combined.
	 * Throws on catastrophic parse failure (structurally malformed document).
	 * Missing QUILL sentinel and unknown quill refs surface as error-severity diagnostics.
	 */
	public async projectDocument(markdown: string): Promise<import('@quillmark/wasm').Diagnostic[]> {
		await this.ensureEngine();
		let doc: WasmDocument | null = null;
		try {
			doc = this.DocumentClass!.fromMarkdown(markdown);
		} catch (err) {
			throw new Error(`Document parse failed: ${err instanceof Error ? err.message : String(err)}`);
		}
		try {
			const parseWarnings = [...doc.warnings];
			const quillRef = doc.quillRef;
			if (!quillRef) {
				return [
					...parseWarnings,
					{
						severity: 'error' as const,
						message: 'No QUILL reference found. Add "QUILL: <name>" to the document frontmatter.',
						sourceChain: []
					}
				];
			}
			let quill: Quill;
			try {
				quill = await this.loadQuill(quillRef);
			} catch {
				return [
					...parseWarnings,
					{
						severity: 'error' as const,
						message: `Unknown quill "${quillRef}". Use list_quills to see available quills.`,
						sourceChain: []
					}
				];
			}
			const form = quill.form(doc);
			return [...parseWarnings, ...form.diagnostics];
		} finally {
			doc.free();
		}
	}

	public async getDatePathConfigForMarkdown(
		markdown: string
	): Promise<QuillSchemaDatePaths | null> {
		await this.ensureEngine();
		const { quillRef } = await this.parseDocument(markdown);
		if (!quillRef) return null;

		try {
			const quill = await this.loadQuill(quillRef);
			return collectDatePaths(quill);
		} catch {
			return null;
		}
	}
}

export const quillmarkServerService = QuillmarkServerService.getInstance();
