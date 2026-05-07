/**
 * EditorState — reactive wrapper around a @quillmark/wasm `Document`.
 *
 * The wasm `Document` is the single source of truth for parsing, mutation,
 * and serialization. Cards are positional: `cards[i]`. A version counter
 * surfaces wasm-side mutations to Svelte 5 runes ($derived consumers depend
 * on `version` so they re-read after each setField/insertCard/etc).
 *
 * Lifecycle: wasm 0.66 ships with `--weak-refs`, so dropped `Document`
 * handles are reclaimed by `FinalizationRegistry`. We keep `destroy()` as
 * an eager teardown hook for component unmount but no longer need to
 * hand-balance `.free()` calls in the success path.
 */

import type { Card, Diagnostic, Document } from '@quillmark/wasm';

export type EditorDiagnostic = Diagnostic;

/**
 * Shape of errors thrown by `@quillmark/wasm` (every throw site since 0.66
 * carries `.diagnostics`). The runtime exception is a regular JS `Error`
 * with a non-empty `Diagnostic[]` attached.
 */
function diagnosticsFromError(err: unknown): Diagnostic[] {
	if (err && typeof err === 'object' && 'diagnostics' in err) {
		const list = (err as { diagnostics?: unknown }).diagnostics;
		if (Array.isArray(list) && list.length > 0) return list as Diagnostic[];
	}
	const message = err instanceof Error ? err.message : String(err);
	return [{ severity: 'error', message, sourceChain: [] }];
}

/** Snapshot view of a card for read-only consumers. */
export type CardView = Card;

/**
 * Determines whether a value should be treated as "empty" at the YAML write boundary.
 * Empty values are removed from the document; non-empty values are written.
 *
 * When `type` is undefined, only null/undefined count as empty (preserves 0, false, '').
 */
export function isEmptyValue(value: unknown, type?: string): boolean {
	switch (type) {
		case 'string':
			return typeof value !== 'string' || value.trim() === '';
		case 'array':
			return !Array.isArray(value) || value.length === 0;
		case 'number':
		case 'integer':
			return value === null || value === undefined;
		case 'boolean':
			return false;
		default:
			return value === null || value === undefined;
	}
}

/**
 * Mutation target — either the document's main card or a positional card index.
 */
export type EditorTarget = { kind: 'main' } | { kind: 'card'; index: number };

export class EditorStateStore {
	/** Reactive version counter — bumped after every `Document` mutation. */
	private _version = $state(0);
	/** The wasm-backed document. Hidden behind getters that depend on `_version`. */
	private _doc: Document | null = null;
	/** Lazy-loaded `Document` constructor, cached after first parse. */
	private DocumentClass: typeof Document | null = null;

	/**
	 * Parse-time diagnostics. On a successful load these are the document's
	 * `.warnings`; on a failed load they're the rich diagnostics carried by
	 * the thrown `Error`. The UI renders both shapes the same way.
	 */
	diagnostics = $state<EditorDiagnostic[]>([]);

	/** Touch the version counter so derived getters depend on it. */
	private bump(): void {
		this._version++;
	}

	/**
	 * Initialize the store from a markdown string.
	 *
	 * No-ops when `markdown` parses to a `Document` structurally equal to
	 * the current one (via wasm's `Document.equals`) — this lets callers
	 * fire on every upstream prop change without churning state when the
	 * upstream value is just a re-emission of our own canonical form.
	 */
	initFromDocument(markdown: string, DocumentCtor: typeof Document): void {
		this.DocumentClass = DocumentCtor;
		let next: Document;
		try {
			next = DocumentCtor.fromMarkdown(markdown);
		} catch (err) {
			this.diagnostics = diagnosticsFromError(err);
			this.bump();
			throw err;
		}
		// Skip the swap when the upstream input is structurally equal to the
		// loaded document — caller usually parsed a re-emission of our own
		// canonical markdown. FinalizationRegistry collects `next`.
		if (this._doc?.equals(next)) {
			this.diagnostics = next.warnings;
			return;
		}
		this._doc = next;
		this.diagnostics = next.warnings;
		this.bump();
	}

	/** True after `initFromDocument` has been called successfully. */
	get isInitialized(): boolean {
		void this._version;
		return this._doc !== null;
	}

	/** Serialize the document back to canonical Quillmark Markdown. */
	toDocumentString(): string {
		void this._version;
		return this._doc?.toMarkdown() ?? '';
	}

	/** Quill reference (e.g. `"usaf_memo@0.2.0"`), or `''` when unset. */
	get quillRef(): string {
		void this._version;
		return this._doc?.quillRef ?? '';
	}

	/** Document-level (main card) frontmatter. */
	get mainFrontmatter(): Record<string, unknown> {
		void this._version;
		return (this._doc?.main.frontmatter as Record<string, unknown>) ?? {};
	}

	/** Document-level body. */
	get mainBody(): string {
		void this._version;
		return this._doc?.main.body ?? '';
	}

	/** Snapshot of cards (positional). */
	get cards(): readonly CardView[] {
		void this._version;
		return this._doc?.cards ?? [];
	}

	/** Read a single card by positional index, or undefined when out of range. */
	getCard(index: number): CardView | undefined {
		void this._version;
		return this._doc?.cards[index];
	}

	// --------------------------------------------------------------------------
	// Mutations — every method bumps `_version` so derived state re-reads.
	// --------------------------------------------------------------------------

	setMainBody(body: string): void {
		this._doc?.replaceBody(body);
		this.bump();
	}

	setCardBody(index: number, body: string): void {
		if (!this._doc) return;
		// Card may have been removed or reordered between when a debounced
		// caller captured the index and when this mutation runs. Drop the
		// stale write rather than letting wasm throw `IndexOutOfRange`.
		if (index < 0 || index >= this._doc.cardCount) return;
		this._doc.updateCardBody(index, body);
		this.bump();
	}

	/**
	 * Replace the QUILL reference. QUILL is mandatory and not a regular
	 * frontmatter field — clearing it is not representable, and `setField`
	 * throws on the reserved name. Routes through wasm's dedicated primitive.
	 */
	setQuillRef(quillRef: string): void {
		if (!this._doc) return;
		this._doc.setQuillRef(quillRef);
		this.bump();
	}

	/** Set or unset a top-level field on the main card. */
	setMainField(name: string, value: unknown, fieldType?: string): void {
		if (!this._doc) return;
		if (isEmptyValue(value, fieldType)) {
			this._doc.removeField(name);
		} else {
			this._doc.setField(name, value);
		}
		this.bump();
	}

	/** Batch-set multiple top-level fields on the main card. */
	setMainFields(entries: Record<string, unknown>, fieldTypes?: Record<string, string>): void {
		if (!this._doc) return;
		for (const [name, value] of Object.entries(entries)) {
			if (isEmptyValue(value, fieldTypes?.[name])) {
				this._doc.removeField(name);
			} else {
				this._doc.setField(name, value);
			}
		}
		this.bump();
	}

	/** Set or unset a top-level field on a card by positional index. */
	setCardField(index: number, name: string, value: unknown, fieldType?: string): void {
		if (!this._doc) return;
		if (index < 0 || index >= this._doc.cardCount) return;
		if (isEmptyValue(value, fieldType)) {
			this._doc.removeCardField(index, name);
		} else {
			this._doc.updateCardField(index, name, value);
		}
		this.bump();
	}

	/** Batch-set multiple fields on a single card. */
	setCardFields(
		index: number,
		entries: Record<string, unknown>,
		fieldTypes?: Record<string, string>
	): void {
		if (!this._doc) return;
		if (index < 0 || index >= this._doc.cardCount) return;
		for (const [name, value] of Object.entries(entries)) {
			if (isEmptyValue(value, fieldTypes?.[name])) {
				this._doc.removeCardField(index, name);
			} else {
				this._doc.updateCardField(index, name, value);
			}
		}
		this.bump();
	}

	/**
	 * Insert a new card at `index` with the given (valid) tag. Returns the
	 * new card index, or -1 if not initialized. Wasm rejects empty/invalid
	 * tags; callers must supply a real tag (managing any pre-tag UI state
	 * themselves).
	 *
	 * `fields` lets the caller seed initial frontmatter — typically the
	 * `default` values from `quill.blankCard(tag).values` so a freshly
	 * inserted card matches Quillmark's authoritative defaults in one
	 * mutation rather than via a follow-up batch write.
	 */
	addCard(index: number, tag: string, fields: Record<string, unknown> = {}): number {
		if (!this._doc) return -1;
		const clamped = Math.max(0, Math.min(index, this._doc.cardCount));
		this._doc.insertCard(clamped, { tag, fields, body: '' });
		this.bump();
		return clamped;
	}

	/** Remove the card at `index`. */
	removeCard(index: number): boolean {
		if (!this._doc) return false;
		if (index < 0 || index >= this._doc.cardCount) return false;
		const removed = this._doc.removeCard(index);
		if (removed) this.bump();
		return Boolean(removed);
	}

	/** Move a card from one position to another. */
	moveCardTo(from: number, to: number): boolean {
		if (!this._doc) return false;
		const total = this._doc.cardCount;
		if (from < 0 || from >= total || to < 0 || to >= total || from === to) return false;
		this._doc.moveCard(from, to);
		this.bump();
		return true;
	}

	/**
	 * Re-tag a card in place. Frontmatter and body are preserved by the wasm
	 * primitive; schema-aware migration (clearing orphan fields, applying new
	 * defaults) is the caller's concern.
	 */
	setCardTag(index: number, newTag: string): void {
		if (!this._doc) return;
		if (index < 0 || index >= this._doc.cardCount) return;
		const card = this._doc.cards[index];
		if (!card || card.tag === newTag) return;
		this._doc.setCardTag(index, newTag);
		this.bump();
	}

	/**
	 * Eagerly free the underlying wasm Document. Optional with `--weak-refs`
	 * lifecycle (FinalizationRegistry will reclaim it on its own); call from
	 * component teardown when deterministic release matters.
	 */
	destroy(): void {
		this._doc?.free();
		this._doc = null;
	}
}
