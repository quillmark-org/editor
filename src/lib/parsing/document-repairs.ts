/**
 * Client-side document repairs — run when a document is loaded (browser).
 *
 * Each repair walks the wasm `Document` (frontmatter + cards) and rewrites
 * matching fields in-place via the Document mutation API. Repairs commit by
 * round-tripping through `doc.toMarkdown()`.
 */

import type { Document } from '@quillmark/wasm';
import type { QuillSchemaDatePaths } from './quill-schema-date-paths';

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export type ClientDocumentRepairId = 'legacy-dates-to-iso';

export const CLIENT_DOCUMENT_REPAIR_IDS = ['legacy-dates-to-iso'] as const;

export interface RunClientDocumentRepairsResult {
	document: string;
	applied: ClientDocumentRepairId[];
}

export interface RunClientDocumentRepairsOptions {
	now?: Date;
	include?: readonly ClientDocumentRepairId[];
	/** `type: date` field paths from the Quillmark schema. */
	datePaths?: QuillSchemaDatePaths | null;
}

export type { QuillSchemaDatePaths };

interface RepairContext {
	now: Date;
	datePaths: QuillSchemaDatePaths | null;
}

type RepairFn = (doc: Document, ctx: RepairContext) => boolean;

const CLIENT_DOCUMENT_REPAIRS: { id: ClientDocumentRepairId; run: RepairFn }[] = [
	{ id: 'legacy-dates-to-iso', run: repairLegacyDatesInDocument }
];

/**
 * Run all registered client document repairs in order against the markdown
 * document. Requires the wasm `Document` constructor (loaded once via
 * `quillmarkService.Document`) so repairs can operate on the typed model.
 */
export function runClientDocumentRepairs(
	document: string,
	DocumentCtor: typeof Document,
	options?: RunClientDocumentRepairsOptions
): RunClientDocumentRepairsResult {
	const ctx: RepairContext = {
		now: options?.now ?? new Date(),
		datePaths: options?.datePaths ?? null
	};
	const enabledIds =
		options?.include && options.include.length > 0
			? new Set<ClientDocumentRepairId>(options.include)
			: null;

	let doc: Document | null = null;
	try {
		doc = DocumentCtor.fromMarkdown(document);
	} catch {
		return { document, applied: [] };
	}

	const applied: ClientDocumentRepairId[] = [];
	try {
		for (const repair of CLIENT_DOCUMENT_REPAIRS) {
			if (enabledIds && !enabledIds.has(repair.id)) continue;
			if (repair.run(doc, ctx)) applied.push(repair.id);
		}
		const result = applied.length > 0 ? doc.toMarkdown() : document;
		return { document: result, applied };
	} finally {
		doc.free();
	}
}

// ---------------------------------------------------------------------------
// legacy-dates-to-iso
// ---------------------------------------------------------------------------

const MONTHS_SHORT = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
] as const;
const MONTHS_FULL = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december'
] as const;

function toIso(y: number, m0: number, d: number): string {
	const mm = String(m0 + 1).padStart(2, '0');
	const dd = String(d).padStart(2, '0');
	return `${y}-${mm}-${dd}`;
}

function isValidIsoCalendarDate(iso: string): boolean {
	const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) return false;
	const y = parseInt(m[1], 10);
	const mo = parseInt(m[2], 10) - 1;
	const d = parseInt(m[3], 10);
	const dt = new Date(y, mo, d);
	return dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d;
}

function parseLegacyDateString(trimmed: string, ref: Date): string | null {
	if (trimmed.match(/^\d{1,2} [A-Z][a-z]{2}$/)) {
		const [dStr, mon] = trimmed.split(' ');
		const mi = MONTHS_SHORT.indexOf(mon as (typeof MONTHS_SHORT)[number]);
		if (mi < 0) return null;
		const y = ref.getFullYear();
		const d = parseInt(dStr, 10);
		const dt = new Date(y, mi, d);
		return isNaN(dt.getTime()) ? null : toIso(dt.getFullYear(), dt.getMonth(), dt.getDate());
	}
	if (trimmed.match(/^\d{1,2} [A-Z][a-z]{2} \d{2}$/)) {
		const [dStr, mon, yyStr] = trimmed.split(' ');
		const mi = MONTHS_SHORT.indexOf(mon as (typeof MONTHS_SHORT)[number]);
		if (mi < 0) return null;
		const century = Math.floor(ref.getFullYear() / 100) * 100;
		const y = century + parseInt(yyStr, 10);
		const d = parseInt(dStr, 10);
		const dt = new Date(y, mi, d);
		return isNaN(dt.getTime()) ? null : toIso(dt.getFullYear(), dt.getMonth(), dt.getDate());
	}
	if (trimmed.match(/^\d{1,2} [A-Za-z]+ \d{4}$/)) {
		const [dStr, monRaw, yyyyStr] = trimmed.split(' ');
		const mi = MONTHS_FULL.indexOf(monRaw.toLowerCase() as (typeof MONTHS_FULL)[number]);
		if (mi < 0) return null;
		const y = parseInt(yyyyStr, 10);
		const d = parseInt(dStr, 10);
		const dt = new Date(y, mi, d);
		return isNaN(dt.getTime()) ? null : toIso(dt.getFullYear(), dt.getMonth(), dt.getDate());
	}
	return null;
}

/**
 * Convert legacy wizard date strings to ISO and clear non-ISO/non-convertible
 * strings to empty.
 */
export function repairDateScalar(value: string, now: Date): { next: string; changed: boolean } {
	const trimmed = value.trim();
	if (!trimmed) {
		return { next: value, changed: false };
	}
	if (isValidIsoCalendarDate(trimmed)) {
		return { next: value, changed: false };
	}

	const legacyIso = parseLegacyDateString(trimmed, now);
	if (legacyIso !== null) {
		if (legacyIso === value) return { next: value, changed: false };
		return { next: legacyIso, changed: true };
	}
	return { next: '', changed: value !== '' };
}

/** Match a concrete path against a dotted pattern with optional `*` segments. */
function pathMatchesPattern(path: string[], patternParts: string[]): boolean {
	let pi = 0;
	let pj = 0;
	while (pj < patternParts.length) {
		if (pi >= path.length) return false;
		if (patternParts[pj] === '*') {
			pi++;
			pj++;
			continue;
		}
		if (path[pi] !== patternParts[pj]) return false;
		pi++;
		pj++;
	}
	return pi === path.length && pj === patternParts.length;
}

function pathMatchesAny(path: string[], patterns: readonly string[]): boolean {
	for (const p of patterns) {
		const parts = p.split('.');
		if (pathMatchesPattern(path, parts)) return true;
	}
	return false;
}

/**
 * Repair every leaf string under `value` whose dotted path (from `path`)
 * matches one of `patterns`. Returns the repaired value and whether any
 * change was made.
 */
function deepRepairDatesAtPaths(
	value: unknown,
	now: Date,
	path: string[],
	patterns: readonly string[]
): { val: unknown; changed: boolean } {
	if (value === null || value === undefined) {
		return { val: value, changed: false };
	}
	if (typeof value === 'string') {
		if (!pathMatchesAny(path, patterns)) {
			return { val: value, changed: false };
		}
		const r = repairDateScalar(value, now);
		return { val: r.next, changed: r.changed };
	}
	if (value instanceof Date) {
		return { val: value, changed: false };
	}
	if (Array.isArray(value)) {
		let changed = false;
		const next = value.map((item, i) => {
			const r = deepRepairDatesAtPaths(item, now, [...path, String(i)], patterns);
			changed ||= r.changed;
			return r.val;
		});
		return { val: next, changed };
	}
	if (typeof value === 'object') {
		let changed = false;
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			const r = deepRepairDatesAtPaths(v, now, [...path, k], patterns);
			changed ||= r.changed;
			out[k] = r.val;
		}
		return { val: out, changed };
	}
	return { val: value, changed: false };
}

function repairLegacyDatesInDocument(doc: Document, ctx: RepairContext): boolean {
	if (!ctx.datePaths) return false;
	let anyChange = false;

	const main = doc.main.frontmatter as Record<string, unknown>;
	for (const [field, value] of Object.entries(main)) {
		const r = deepRepairDatesAtPaths(value, ctx.now, [field], ctx.datePaths.frontmatter);
		if (r.changed) {
			doc.setField(field, r.val);
			anyChange = true;
		}
	}

	for (let i = 0; i < doc.cards.length; i++) {
		const card = doc.cards[i];
		const patterns = ctx.datePaths.cards.get(card.tag) ?? [];
		if (patterns.length === 0) continue;
		const fm = card.frontmatter as Record<string, unknown>;
		for (const [field, value] of Object.entries(fm)) {
			const r = deepRepairDatesAtPaths(value, ctx.now, [field], patterns);
			if (r.changed) {
				doc.updateCardField(i, field, r.val);
				anyChange = true;
			}
		}
	}

	return anyChange;
}
