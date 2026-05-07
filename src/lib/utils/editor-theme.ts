import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

/**
 * Build a CodeMirror theme that reads the `--qm-*` CSS custom properties from
 * the given host element. Pass the editor's container element so locally
 * scoped overrides are honored.
 *
 * Dark mode is detected by walking up to the nearest ancestor with the
 * `qm-dark` class. If no ancestor has it, light mode is assumed.
 */
export function createEditorTheme(host: Element = document.documentElement): Extension {
	const styles = getComputedStyle(host);
	const isDark = host.closest?.('.qm-dark') != null;

	const v = (name: string, fallback = '') =>
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
