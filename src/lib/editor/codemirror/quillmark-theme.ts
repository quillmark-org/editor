import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

/**
 * Creates a CodeMirror theme combining built-in editor styling and QuillMark
 * syntax highlighting. Reads `--qm-*` CSS custom properties from the host
 * element so locally scoped overrides cascade in.
 *
 * Dark mode is detected by walking up to the nearest ancestor with the
 * `qm-dark` class. If no ancestor has it, light mode is assumed.
 */
export function createQuillmarkTheme(host: Element = document.documentElement): Extension {
	const styles = getComputedStyle(host);
	const isDark = host.closest?.('.qm-dark') != null;

	const v = (name: string, fallback = ''): string =>
		(styles.getPropertyValue(name) || fallback).trim();

	return EditorView.theme(
		{
			// ── Built-in CodeMirror selectors ───────────────────────────────
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
			},

			// ── QuillMark syntax highlighting ────────────────────────────────

			// Metadata block background and border
			'.cm-quillmark-block': {
				backgroundColor: v('--qm-syntax-metadata-bg'),
				paddingLeft: '12px'
			},

			// CARD and QUILL keywords
			'.cm-quillmark-card-keyword, .cm-quillmark-quill-keyword': {
				color: v('--qm-syntax-keyword'),
				fontWeight: '600'
			},

			// Card/quill name values
			'.cm-quillmark-card-name': {
				color: v('--qm-foreground'),
				fontWeight: '500'
			},

			// YAML keys
			'.cm-quillmark-yaml-key': {
				color: v('--qm-syntax-key')
			},

			// YAML string values
			'.cm-quillmark-yaml-string': {
				color: v('--qm-foreground')
			},

			// YAML number values
			'.cm-quillmark-yaml-number': {
				color: v('--qm-foreground')
			},

			// YAML boolean values
			'.cm-quillmark-yaml-bool': {
				color: v('--qm-foreground')
			},

			// YAML comments
			'.cm-quillmark-yaml-comment': {
				color: v('--qm-syntax-comment'),
				fontStyle: 'italic'
			},

			// Markdown comment delimiters (<!-- and -->)
			'.cm-markdown-comment-delimiter': {
				color: v('--qm-syntax-comment'),
				opacity: '0.6'
			},

			// Markdown comment content
			'.cm-markdown-comment-content': {
				color: v('--qm-syntax-comment'),
				fontStyle: 'italic'
			}
		},
		{ dark: isDark }
	);
}
