import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

/**
 * Creates a CodeMirror theme for QuillMark syntax highlighting
 * Uses CSS custom properties from the design system
 */
export function createQuillmarkTheme(): Extension {
	// Get computed CSS custom properties at runtime
	const styles = getComputedStyle(document.documentElement);
	const isDark = document.documentElement.classList.contains('dark');

	// Helper function to get CSS custom property without fallback
	const getCssVar = (name: string): string => {
		return styles.getPropertyValue(name).trim();
	};

	return EditorView.theme(
		{
			// Metadata block delimiters (---)
			'.cm-quillmark-delimiter': {
				color: getCssVar('--color-muted-foreground')
			},

			// Metadata block background and border
			'.cm-quillmark-block': {
				backgroundColor: getCssVar('--color-syntax-metadata-bg'),
				paddingLeft: '12px'
			},

			// Line containing fold placeholder
			'.cm-line:has(.cm-foldPlaceholder)': {
				backgroundColor: getCssVar('--color-syntax-metadata-bg')
			},

			// Fold placeholder (metadata) - wrapper
			'.cm-foldPlaceholder': {
				backgroundColor: 'transparent',
				color: getCssVar('--color-foreground'),
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
				color: getCssVar('--color-syntax-keyword'),
				fontWeight: '600'
			},

			// Card/quill name values
			'.cm-quillmark-card-name': {
				color: getCssVar('--color-foreground'),
				fontWeight: '500'
			},

			// YAML keys
			'.cm-quillmark-yaml-key': {
				color: getCssVar('--color-syntax-key')
			},

			// YAML string values
			'.cm-quillmark-yaml-string': {
				color: getCssVar('--color-foreground')
			},

			// YAML number values
			'.cm-quillmark-yaml-number': {
				color: getCssVar('--color-foreground')
			},

			// YAML boolean values
			'.cm-quillmark-yaml-bool': {
				color: getCssVar('--color-foreground')
			},

			// YAML comments
			'.cm-quillmark-yaml-comment': {
				color: getCssVar('--color-syntax-comment'),
				fontStyle: 'italic'
			},

			// YAML !fill tag - red color to draw attention
			'.cm-quillmark-yaml-tag-fill': {
				color: getCssVar('--color-syntax-fill-tag'),
				fontWeight: '500'
			},

			// YAML value for !fill tagged field - highlighted like placeholders
			'.cm-quillmark-yaml-fill-value': {
				backgroundColor: getCssVar('--color-syntax-fill-value-bg'),
				borderRadius: '2px',
				padding: '0 2px',
				margin: '0 -2px'
			},

			// Markdown bold delimiters (** or __)
			'.cm-markdown-bold-delimiter': {
				color: getCssVar('--color-muted-foreground'),
				opacity: '0.6'
			},

			// Markdown bold content
			'.cm-markdown-bold-content': {
				fontWeight: '600'
			},

			// Markdown underline delimiters (<u>, </u>)
			'.cm-markdown-underline-delimiter': {
				color: getCssVar('--color-muted-foreground'),
				opacity: '0.6'
			},

			// Markdown underline content
			'.cm-markdown-underline-content': {
				textDecoration: 'underline'
			},

			// Markdown italic delimiters (* or _)
			'.cm-markdown-italic-delimiter': {
				color: getCssVar('--color-muted-foreground'),
				opacity: '0.6'
			},

			// Markdown italic content
			'.cm-markdown-italic-content': {
				fontStyle: 'italic'
			},

			// Markdown link text
			'.cm-markdown-link-text': {
				color: getCssVar('--color-primary'),
				textDecoration: 'underline'
			},

			// Markdown link URL/reference
			'.cm-markdown-link-url': {
				color: getCssVar('--color-muted-foreground'),
				opacity: '0.7'
			},

			// Markdown link brackets and parentheses
			'.cm-markdown-link-bracket': {
				color: getCssVar('--color-muted-foreground'),
				opacity: '0.5'
			},

			// Markdown comment delimiters (<!-- and -->)
			'.cm-markdown-comment-delimiter': {
				color: getCssVar('--color-syntax-comment'),
				opacity: '0.6'
			},

			// Markdown comment content
			'.cm-markdown-comment-content': {
				color: getCssVar('--color-syntax-comment'),
				fontStyle: 'italic'
			},

			// Markdown placeholder wrapper (for click targeting)
			'.cm-markdown-placeholder': {
				cursor: 'pointer',
				backgroundColor: getCssVar('--color-placeholder-bg'),
				borderRadius: '2px',
				padding: '0 2px',
				margin: '0 -2px',
				transition: 'background-color 0.15s ease'
			},

			'.cm-markdown-placeholder:hover': {
				backgroundColor: getCssVar('--color-placeholder-bg-active')
			},

			// Markdown placeholder delimiters ({: and :})
			'.cm-markdown-placeholder-delimiter': {
				color: getCssVar('--color-placeholder-delimiter'),
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
				color: getCssVar('--color-muted-foreground'),
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
				color: getCssVar('--color-foreground')
			}
		},
		{ dark: isDark }
	);
}
