/**
 * Quillmark Service Types
 *
 * Type definitions for the Quillmark service and related functionality,
 * built on @quillmark/wasm 0.75 (Document model) and @quillmark/quiver.
 */

import { AppError } from '$lib/errors';
import type {
	OutputFormat,
	RenderResult as WasmRenderResult,
	Artifact as WasmArtifact,
	Diagnostic as WasmDiagnostic,
	Location as WasmLocation,
	Severity as WasmSeverity,
	Document as WasmDocument,
	Quill as WasmQuill,
	QuillCardSchema,
	QuillFieldSchema
} from '@quillmark/wasm';
import type { QuillSchemaDatePaths } from '$lib/parsing/quill-schema-date-paths';

/**
 * Typed Quillmark document handle (re-export for callers).
 */
export type Document = WasmDocument;

/**
 * Render-ready Quill handle. Exposes `.metadata`, `.form(doc)`, `.render(doc, opts)`.
 */
export type Quill = WasmQuill;

/**
 * Individual artifact in a render result
 */
export type RenderArtifact = WasmArtifact;

/**
 * Render result structure returned by Quillmark WASM engine
 */
export type RenderResult = WasmRenderResult;

/**
 * Detailed diagnostic information from Quillmark rendering
 */
export type QuillmarkDiagnostic = WasmDiagnostic;

/**
 * Render format options
 */
export type RenderFormat = OutputFormat;

/**
 * Schema entry for a single field declared in a quill's `Quill.yaml`.
 * Native type from `@quillmark/wasm`.
 */
export type SchemaField = QuillFieldSchema;

/**
 * Schema for either the main card or a single card-type.
 * Native type from `@quillmark/wasm`.
 */
export type FormSchema = QuillCardSchema;

/**
 * Optional rendering configuration for Quillmark output.
 */
export interface RenderOptions {
	/** Pixels per inch for raster outputs (e.g., PNG thumbnails). */
	ppi?: number;

	/** Specific 0-indexed pages to render. Out-of-range indices throw a hard error (since wasm 0.65.1). */
	pages?: number[];
}

/**
 * Quill metadata derived from the built Quiver manifest.
 */
export interface QuillMetadata {
	name: string;
	version: string;
	description?: string;
}

/**
 * Resolved per-quill info exposed to the editor (synchronously, after `ensureQuillResolved`).
 *
 * Schemas (main + per-card) are NOT cached here — they live on the live
 * `Quill` instance and are projected on demand via `quill.form(doc)`.
 * `cardTypes` is the only piece we extract ourselves, because the wasm API
 * has no native enumeration of valid card-type tags.
 */
export interface QuillInfo {
	name: string;
	version: string;
	description?: string;
	supportedFormats: OutputFormat[];
	/** Card-type tags this quill accepts (from `Quill.yaml` `cards:` keys). */
	cardTypes: readonly string[];
}

/**
 * Bundled quiver manifest (from `static/quills/manifest.<hash>.json`).
 */
export interface QuillManifest {
	quills: QuillMetadata[];
}

/**
 * Error codes for Quillmark service operations
 */
export type QuillmarkErrorCode =
	| 'not_initialized'
	| 'quill_not_found'
	| 'render_error'
	| 'load_error'
	| 'source_unavailable';

/**
 * Error severity level
 */
export type DiagnosticSeverity = WasmSeverity;

/**
 * Source location for an error
 */
export type DiagnosticLocation = WasmLocation;

/**
 * Custom error class for Quillmark service errors
 */
export class QuillmarkError extends AppError {
	code: QuillmarkErrorCode;
	diagnostic?: QuillmarkDiagnostic;
	diagnostics?: QuillmarkDiagnostic[];

	constructor(
		code: QuillmarkErrorCode,
		message: string,
		diagnostic?: QuillmarkDiagnostic,
		diagnostics?: QuillmarkDiagnostic[]
	) {
		super(code, message, 400);
		this.name = 'QuillmarkError';
		this.code = code;
		this.diagnostic = diagnostic;
		this.diagnostics = diagnostics || (diagnostic ? [diagnostic] : undefined);
	}
}

/**
 * Public interface for the Quillmark service.
 */
export interface QuillmarkService {
	initialize(): Promise<void>;
	isReady(): boolean;
	readonly Document: typeof import('@quillmark/wasm').Document;
	getAvailableQuills(): QuillMetadata[];

	/** Synchronous Quill metadata lookup (cache-warmed by `ensureQuillResolved`). */
	getQuillInfo(quillRef: string): QuillInfo;

	/**
	 * Synchronous render-ready Quill handle. Use `quill.form(doc)` for
	 * schema/values, `quill.render(doc, opts)` for output. Cache-warmed by
	 * `ensureQuillResolved`; throws if not yet resolved.
	 */
	getQuill(quillRef: string): Quill;

	/** Resolve and load a quill so subsequent `getQuill`/`getQuillInfo` are synchronous. */
	ensureQuillResolved(quillRef: string): Promise<void>;

	/**
	 * Parse markdown into a typed `Document`. Caller is responsible for `.free()` /
	 * `using` semantics if it doesn't pass the doc to render().
	 */
	parseDocument(markdown: string): Document;

	/** Resolve schema date field paths for legacy date migration. */
	getDatePathConfigForMarkdown(markdown: string): Promise<QuillSchemaDatePaths | null>;

	render(markdown: string, format?: RenderFormat, options?: RenderOptions): Promise<RenderResult>;

	downloadDocument(markdown: string, filename: string, format: RenderFormat): Promise<void>;
}
