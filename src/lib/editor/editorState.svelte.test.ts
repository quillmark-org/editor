/// <reference types="@vitest/browser/matchers" />

import { beforeAll, describe, expect, it } from 'vitest';
import { EditorStateStore } from './editorState.svelte';
import usafTemplateMd from '../../../templates/usaf_template.md?raw';

describe('USAF memo round-trip', () => {
	let DocumentCtor: typeof import('@quillmark/wasm').Document;

	beforeAll(async () => {
		const wasm = await import('@quillmark/wasm');
		if (wasm.init) wasm.init();
		DocumentCtor = wasm.Document;
	});

	it('preserves subject + body edits on main and added cards across a serialize/parse round-trip', () => {
		const MAIN_SUBJECT = 'CRIB-MAIN-SUBJECT';
		const MAIN_BODY = 'CRIB-MAIN-BODY';
		const ADDED_SUBJECT = 'CRIB-ADDED-SUBJECT';
		const ADDED_BODY = 'CRIB-ADDED-BODY';

		// Import the official USAF Memo template
		const store = new EditorStateStore();
		store.initFromDocument(usafTemplateMd, DocumentCtor);
		expect(store.quillRef).toMatch(/^usaf_memo/);
		expect(store.cards).toHaveLength(0);

		// Edit the main card and add a second card with its own subject + body
		store.setMainField('subject', MAIN_SUBJECT);
		store.setMainBody(MAIN_BODY);

		const addedIndex = store.addCard(store.cards.length, 'indorsement');
		store.setCardField(addedIndex, 'subject', ADDED_SUBJECT);
		store.setCardBody(addedIndex, ADDED_BODY);

		// Sanity-check live state before serializing
		expect(store.mainFrontmatter.subject).toBe(MAIN_SUBJECT);
		expect(store.mainBody.trim()).toBe(MAIN_BODY);
		expect(store.cards[addedIndex]?.frontmatter.subject).toBe(ADDED_SUBJECT);
		expect(store.cards[addedIndex]?.body.trim()).toBe(ADDED_BODY);

		// Serialize to markdown
		const markdown = store.toDocumentString();
		expect(markdown).toContain(MAIN_SUBJECT);
		expect(markdown).toContain(MAIN_BODY);
		expect(markdown).toContain(ADDED_SUBJECT);
		expect(markdown).toContain(ADDED_BODY);

		// Round-trip: parse the serialized markdown into a fresh Document
		const replay = new EditorStateStore();
		replay.initFromDocument(markdown, DocumentCtor);

		expect(replay.mainFrontmatter.subject).toBe(MAIN_SUBJECT);
		expect(replay.mainBody.trim()).toBe(MAIN_BODY);
		expect(replay.cards).toHaveLength(1);
		expect(replay.cards[0]?.frontmatter.subject).toBe(ADDED_SUBJECT);
		expect(replay.cards[0]?.body.trim()).toBe(ADDED_BODY);

		store.destroy();
		replay.destroy();
	});
});
