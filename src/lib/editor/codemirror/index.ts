/**
 * QuillMark editor features for CodeMirror
 * Provides syntax highlighting, folding, and auto-completion for QuillMark syntax
 */

export { quillmarkDecorator } from './quillmark-decorator';
export { createQuillmarkTheme } from './quillmark-theme';
export { quillmarkFoldService } from './quillmark-folding';
export { placeholderClickHandler } from './placeholder-handler';
export { foldAllMetadataBlocks, toggleAllMetadataBlocks } from './quillmark-fold-utils';
export { createEditorKeymaps } from './editor-keybindings';
