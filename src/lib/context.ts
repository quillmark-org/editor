import { getContext, setContext } from 'svelte';
import type { QuillmarkBindings } from './types.js';

const KEY = Symbol.for('@quillmark/editor:bindings');

/**
 * Inject a {@link QuillmarkBindings} into Svelte context.
 *
 * Most consumers don't need this — pass `bindings` as a prop to
 * `<DocumentEditor>` and it installs context for its descendants automatically.
 *
 * Call this directly only when mounting `<MarkdownEditor>`, `<VisualEditor>`,
 * or `<Preview>` standalone (without an enclosing `<DocumentEditor>`); those
 * components read bindings from context.
 */
export function setQuillmarkContext(bindings: QuillmarkBindings): void {
	setContext(KEY, bindings);
}

/**
 * Read the {@link QuillmarkBindings} previously set on context.
 * Throws if no bindings are in scope.
 */
export function getQuillmarkContext(): QuillmarkBindings {
	const value = getContext<QuillmarkBindings | undefined>(KEY);
	if (!value) {
		throw new Error(
			'@quillmark/editor: no QuillmarkBindings on context. Pass `bindings` as a prop to <DocumentEditor>, or call setQuillmarkContext(bindings) in an ancestor when mounting <MarkdownEditor>/<VisualEditor>/<Preview> standalone.'
		);
	}
	return value;
}
