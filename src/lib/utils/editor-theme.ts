import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/**
 * CodeMirror base theme for the advanced-mode markdown editor.
 *
 * Reads the `@quillmark/editor` `--qm-*` design tokens from the host element
 * at construction time so locally scoped overrides cascade in. Dark mode is
 * detected by walking up to the nearest ancestor with the `qm-dark` class.
 */
export function createEditorTheme(host: Element = document.documentElement): Extension {
	const styles = getComputedStyle(host);
	const isDark = host.closest?.('.qm-dark') != null;

	const v = (name: string, fallback = ''): string =>
		(styles.getPropertyValue(name) || fallback).trim();

	return EditorView.theme(
		{
			'&': {
				height: '100%',
				fontSize: '14px',
				backgroundColor: v('--qm-background')
			},
			'.cm-scroller': {
				overflow: 'auto',
				fontFamily: v('--qm-font-mono', 'ui-monospace, monospace')
			},
			'.cm-content': {
				padding: '8px 0',
				color: v('--qm-foreground')
			},
			'.cm-line': {
				padding: '0 8px'
			},
			'.cm-cursor, .cm-dropCursor': {
				borderLeftColor: v('--qm-foreground')
			},
			'&.cm-focused .cm-cursor': {
				borderLeftColor: v('--qm-foreground')
			},
			'.cm-activeLine': {
				backgroundColor: v('--qm-surface')
			},
			'.cm-selectionBackground, .cm-focused .cm-selectionBackground': {
				backgroundColor: v('--qm-brand')
			},
			'.cm-gutters': {
				backgroundColor: v('--qm-background'),
				color: v('--qm-muted-foreground'),
				border: 'none'
			},
			'.cm-lineNumbers .cm-gutterElement': {
				fontSize: '11px'
			}
		},
		{ dark: isDark }
	);
}

/**
 * Markdown + YAML syntax highlighting for the editor (YAML lives inside
 * `~~~card-yaml` blocks; the same rules also apply to any YAML the
 * `yamlFrontmatter` extension matches at the top of a document).
 *
 * Token colors are wired to the `--qm-syntax-*` (and a few general) CSS
 * custom properties rather than fixed hex values. Because CSS variables
 * resolve per active theme, a single `HighlightStyle` adapts to light/dark
 * automatically — no reconfiguration on theme change required.
 */
export function createMarkdownHighlightStyle(): Extension {
	const style = HighlightStyle.define([
		// Markdown
		{
			tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6],
			color: 'var(--qm-syntax-keyword)',
			fontWeight: '600'
		},
		{ tag: t.strong, color: 'var(--qm-foreground)', fontWeight: '600' },
		{ tag: t.emphasis, fontStyle: 'italic' },
		{ tag: t.strikethrough, textDecoration: 'line-through' },
		{ tag: [t.link, t.url], color: 'var(--qm-brand)', textDecoration: 'underline' },
		{ tag: t.monospace, color: 'var(--qm-syntax-fill-tag)' },
		{ tag: t.quote, color: 'var(--qm-muted-foreground)', fontStyle: 'italic' },
		{ tag: t.contentSeparator, color: 'var(--qm-syntax-comment)' },
		{ tag: t.processingInstruction, color: 'var(--qm-muted-foreground)' },
		// YAML (card-yaml block payloads)
		{ tag: [t.propertyName, t.definition(t.propertyName)], color: 'var(--qm-syntax-key)' },
		{ tag: t.string, color: 'var(--qm-foreground)' },
		{ tag: [t.keyword, t.bool, t.null, t.atom, t.number], color: 'var(--qm-syntax-keyword)' },
		{ tag: t.comment, color: 'var(--qm-syntax-comment)', fontStyle: 'italic' }
	]);
	return syntaxHighlighting(style, { fallback: true });
}
