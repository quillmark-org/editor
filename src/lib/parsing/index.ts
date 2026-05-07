/**
 * Centralized Parsing Library
 *
 * Surviving helpers for the @quillmark/wasm-based editor:
 * - Markdown-It instance + comment stripping (used by the ProseMirror parser)
 * - Fenced-code patterns (used by the CodeMirror folding plugin)
 * - Schema-derived date paths + client-side document repairs
 *
 * @module $lib/parsing
 */

export { createMarkdownIt } from './core-parser';
export { stripMarkdownHtmlComments } from './markdown-utils';

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
