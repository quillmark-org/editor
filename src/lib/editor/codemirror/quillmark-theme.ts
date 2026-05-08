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

			// Metadata block delimiters (---)
			'.cm-quillmark-delimiter': {
				color: v('--qm-muted-foreground')
			},

			// Metadata block background and border
			'.cm-quillmark-block': {
				backgroundColor: v('--qm-syntax-metadata-bg'),
				paddingLeft: '12px'
			},

			// Line containing fold placeholder
			'.cm-line:has(.cm-foldPlaceholder)': {
				backgroundColor: v('--qm-syntax-metadata-bg')
			},

			// Fold placeholder (metadata) - wrapper
			'.cm-foldPlaceholder': {
				backgroundColor: 'transparent',
				color: v('--qm-foreground'),
				paddingLeft: '0px',
				border: 'none',
				display: 'inline-flex',
				alignItems: 'center'
			},

			// Fold placeholder text content
			'.cm-foldPlaceholder-text': {
				backgroundColor: 'transparent'
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

			// YAML !fill tag - red color to draw attention
			'.cm-quillmark-yaml-tag-fill': {
				color: v('--qm-syntax-fill-tag'),
				fontWeight: '500'
			},

			// YAML value for !fill tagged field - highlighted like placeholders
			'.cm-quillmark-yaml-fill-value': {
				backgroundColor: v('--qm-syntax-fill-value-bg'),
				borderRadius: '2px',
				padding: '0 2px',
				margin: '0 -2px'
			},

			// Markdown bold delimiters (** or __)
			'.cm-markdown-bold-delimiter': {
				color: v('--qm-muted-foreground'),
				opacity: '0.6'
			},

			// Markdown bold content
			'.cm-markdown-bold-content': {
				fontWeight: '600'
			},

			// Markdown underline delimiters (<u>, </u>)
			'.cm-markdown-underline-delimiter': {
				color: v('--qm-muted-foreground'),
				opacity: '0.6'
			},

			// Markdown underline content
			'.cm-markdown-underline-content': {
				textDecoration: 'underline'
			},

			// Markdown italic delimiters (* or _)
			'.cm-markdown-italic-delimiter': {
				color: v('--qm-muted-foreground'),
				opacity: '0.6'
			},

			// Markdown italic content
			'.cm-markdown-italic-content': {
				fontStyle: 'italic'
			},

			// Markdown link text
			'.cm-markdown-link-text': {
				color: v('--qm-primary'),
				textDecoration: 'underline'
			},

			// Markdown link URL/reference
			'.cm-markdown-link-url': {
				color: v('--qm-muted-foreground'),
				opacity: '0.7'
			},

			// Markdown link brackets and parentheses
			'.cm-markdown-link-bracket': {
				color: v('--qm-muted-foreground'),
				opacity: '0.5'
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
			},

			// Markdown placeholder wrapper (for click targeting)
			'.cm-markdown-placeholder': {
				cursor: 'pointer',
				backgroundColor: v('--qm-placeholder-bg'),
				borderRadius: '2px',
				padding: '0 2px',
				margin: '0 -2px',
				transition: 'background-color 0.15s ease'
			},

			'.cm-markdown-placeholder:hover': {
				backgroundColor: v('--qm-placeholder-bg-active')
			},

			// Markdown placeholder delimiters ({: and :})
			'.cm-markdown-placeholder-delimiter': {
				color: v('--qm-placeholder-delimiter'),
				fontFamily: 'var(--font-mono, monospace)'
			},

			// Markdown placeholder content
			'.cm-markdown-placeholder-content': {
				color: 'inherit', // Inherit body text color - the bg + font is the differentiator
				fontFamily: 'var(--font-mono, monospace)'
			},

			// Wizard button inside fold placeholder
			'.cm-wizard-button': {
				marginLeft: '0px',
				padding: '2px 10px',
				border: 'none',
				borderRadius: '4px',
				background: 'transparent',
				color: v('--qm-muted-foreground'),
				cursor: 'pointer',
				fontSize: '14px',
				fontWeight: '500',
				outline: 'none',
				display: 'inline-flex',
				alignItems: 'center',
				height: '24px',
				transition: 'all 0.24s ease',
				animation: 'slideInFade 0.24s ease-out forwards'
			},

			'.cm-wizard-button:hover': {
				color: v('--qm-foreground')
			}
		},
		{ dark: isDark }
	);
}
