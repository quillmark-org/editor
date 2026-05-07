/**
 * Regex helpers for the CodeMirror layer.
 *
 * Frontmatter / CARD / QUILL parsing is handled natively by @quillmark/wasm;
 * the helpers here only support fenced-code detection and the shared
 * identifier shape used to highlight tag-like values.
 */

/**
 * Matches the opening of a fenced code block.
 * Captures: [1] = fence type (``` or ~~~), [2] = optional language/info string
 */
export const FENCED_CODE_OPEN_PATTERN = /^(```|~~~)(.*)$/;

/** Reusable identifier pattern string for building other regexes. */
export const IDENTIFIER_STR = '[a-z_][a-z0-9_]*';

/**
 * Matches the closing fence for a code block.
 * The fence must match the opening fence type (``` or ~~~).
 */
export function createClosingFencePattern(fence: '```' | '~~~'): RegExp {
	const escaped = fence.replace(/`/g, '\\`');
	return new RegExp(`^${escaped}\\s*$`);
}
