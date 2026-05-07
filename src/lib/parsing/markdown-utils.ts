/**
 * Strip markdown HTML comments from content.
 *
 * Removes `<!-- ... -->` blocks, including multiline comments.
 */
export function stripMarkdownHtmlComments(content: string): string {
	if (!content) return content;
	return content.replace(/<!--[\s\S]*?-->/g, '');
}
