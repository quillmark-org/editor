/**
 * Centralized Parsing Library
 *
 * Surviving helpers for the @quillmark/wasm-based editor:
 * - Fenced-code patterns (used by the CodeMirror folding plugin)
 * - Schema-derived date paths + client-side document repairs
 *
 * The historical markdown-it instance + HTML-comment stripping (formerly used
 * by the ProseMirror parser) was removed during the Lexical migration —
 * @lexical/markdown handles markdown directly, so the custom markdown-it
 * pipeline is no longer needed.
 *
 * @module $lib/parsing
 */

export { FENCED_CODE_OPEN_PATTERN, createClosingFencePattern, IDENTIFIER_STR } from './patterns';

export type { QuillSchemaDatePaths } from './quill-schema-date-paths';

export {
	runClientDocumentRepairs,
	CLIENT_DOCUMENT_REPAIR_IDS,
	repairDateScalar,
	type ClientDocumentRepairId,
	type RunClientDocumentRepairsOptions,
	type RunClientDocumentRepairsResult
} from './document-repairs';
