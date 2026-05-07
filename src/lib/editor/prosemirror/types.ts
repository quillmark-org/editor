import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

/**
 * Visual editor state containing ProseMirror view and state
 */
export interface VisualEditorState {
	view: EditorView | null;
	state: EditorState;
}

/**
 * Props for the VisualEditor component
 */
export interface VisualEditorProps {
	/** Full document content (front matter + body) */
	document: string;
	/** JSON schema for metadata form */
	schema: Record<string, unknown> | null;
	/** Name of the Quill template */
	quillName: string;
	/** Callback when document content changes */
	onDocumentChange: (doc: string) => void;
	/** Callback to switch to Advanced Mode */
	onModeSwitch?: () => void;
}

/**
 * Editor mode - rich text or advanced (raw markdown)
 */
export type EditorMode = 'rich' | 'advanced';
