import { getContext, setContext } from 'svelte';
import type { QuillmarkBindings } from './types.js';

const KEY = Symbol.for('@quillmark/editor:bindings');

/**
 * Inject a {@link QuillmarkBindings} into Svelte context. Call from a
 * component that wraps the editor (e.g. a page-level `+layout.svelte` or
 * a wrapper component you own).
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
			'@quillmark/editor: no QuillmarkBindings on context. Call setQuillmarkContext(bindings) in an ancestor component, or pass `bindings` as a prop to <DocumentEditor>.'
		);
	}
	return value;
}

/** Same as `getQuillmarkContext` but returns `undefined` instead of throwing. */
export function tryGetQuillmarkContext(): QuillmarkBindings | undefined {
	return getContext<QuillmarkBindings | undefined>(KEY);
}
