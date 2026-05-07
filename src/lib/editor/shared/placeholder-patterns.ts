/**
 * Shared regex pattern for identifying placeholders.
 * Matches content between {: and :}.
 * The content can contain ':' characters as long as they are not followed by '}'.
 * Capturing group 1 contains the placeholder content.
 */
export const PLACEHOLDER_REGEX = /\{:((?:[^:\n]|:(?!\}))*):\}/g;

/**
 * Interface for a placeholder match within a text
 */
export interface PlaceholderMatch {
	content: string;
	/** Start index in the source text (inclusive) */
	index: number;
	/** End index in the source text (exclusive) */
	endIndex: number;
}
