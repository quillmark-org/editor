/**
 * QuillMark editor features for CodeMirror
 * Provides syntax highlighting, folding, and auto-completion for QuillMark syntax
 */

export { quillmarkDecorator } from './quillmark-decorator';
export { createQuillmarkTheme } from './quillmark-theme';
export { quillmarkFoldService, findClosingDelimiter } from './quillmark-folding';
export { placeholderClickHandler } from './placeholder-handler';
export {
	isMetadataDelimiter,
	findMetadataBlocks,
	findMarkdownBold,
	findMarkdownItalic,
	findMarkdownLinks,
	findMarkdownPlaceholders
} from './quillmark-patterns';
export {
	foldMetadataBlockAtPosition,
	foldAllMetadataBlocks,
	toggleAllMetadataBlocks,
	toggleMetadataBlockAtCursor
} from './quillmark-fold-utils';
export {
	createEditorKeymaps,
	createListContinuationKeymap,
	createTabIndentKeymap,
	createShiftTabUnindentKeymap,
	createFormattingKeymaps,
	createToggleFrontmatterKeymap,
	type EditorKeymapOptions
} from './editor-keybindings';
export type * from './quillmark-patterns';
