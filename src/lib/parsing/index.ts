/**
 * Centralized Parsing Library
 *
 * Surviving helpers for the @quillmark/wasm-based editor:
 * - Fenced-code patterns (used to skip `---` markers inside code blocks
 *   when detecting metadata-block boundaries)
 *
 * @module $lib/parsing
 */

export { FENCED_CODE_OPEN_PATTERN, createClosingFencePattern, IDENTIFIER_STR } from './patterns';
