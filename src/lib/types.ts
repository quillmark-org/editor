/**
 * Public TypeScript surface for @quillmark/editor.
 *
 * The editor is engine-agnostic: consumers construct a @quillmark/wasm engine
 * (or any equivalent) and pass a {@link QuillmarkBindings} via Svelte context.
 */

import type {
	Document,
	Quill,
	QuillCardSchema,
	QuillFieldSchema,
	OutputFormat,
	RenderResult as WasmRenderResult,
	RenderOptions as WasmRenderOptions,
	Artifact as WasmArtifact,
	Diagnostic as WasmDiagnostic
} from '@quillmark/wasm';

/**
 * Schema for either the main card or a single card-type, projected by
 * `quill.form(doc)`. Native type from `@quillmark/wasm`.
 */
export type FormSchema = QuillCardSchema;

/** Schema entry for a single field. */
export type SchemaField = QuillFieldSchema;

/** Native types re-exported for editor consumers. */
export type RenderFormat = OutputFormat;
export type RenderResult = WasmRenderResult;
export type RenderOptions = WasmRenderOptions;
export type RenderArtifact = WasmArtifact;
export type QuillmarkDiagnostic = WasmDiagnostic;

export interface QuillInfo {
	name: string;
	version: string;
	description?: string;
	supportedFormats: readonly RenderFormat[];
	cardTypes: readonly string[];
}

/**
 * Contract the consumer implements to wire @quillmark/wasm into the editor.
 *
 * Lifecycle is the consumer's responsibility: they construct the engine,
 * load quill templates, and dispose of the engine when done. The editor
 * package never instantiates `Quillmark` directly.
 *
 * `Document` instances returned from `parseDocument` are owned by the caller —
 * the editor's internal state store frees them when no longer needed.
 */
export interface QuillmarkBindings {
	/** Whether the engine is ready to parse and render. */
	readonly isReady: boolean;

	/**
	 * The wasm Document constructor. Exposed so the editor's reactive store
	 * can mutate `Document` instances directly without going through the
	 * engine for every keystroke.
	 */
	readonly Document: typeof Document;

	/** Parse markdown into a wasm Document. The caller owns the result. */
	parseDocument(markdown: string): Document;

	/** Resolve a quill (load schema, register with engine). Idempotent + coalesced. */
	ensureQuillResolved(quillRef: string): Promise<void>;

	/** Synchronous accessor — only valid after ensureQuillResolved resolves. */
	getQuill(quillRef: string): Quill;

	/** Synchronous metadata accessor. */
	getQuillInfo(quillRef: string): QuillInfo;

	/** Render markdown to one or more artifacts. */
	render(markdown: string, format?: RenderFormat, options?: RenderOptions): Promise<RenderResult>;
}

export type EditorMode = 'rich' | 'advanced';

export type EditorTarget = { kind: 'main' } | { kind: 'card'; id: number };

export interface CardView {
	id: number;
	tag: string;
	body: string;
	fields: Record<string, unknown>;
}
