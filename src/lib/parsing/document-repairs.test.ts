import { describe, expect, it } from 'vitest';
import { CLIENT_DOCUMENT_REPAIR_IDS, repairDateScalar } from './document-repairs';

const FIXED = new Date(2026, 3, 13); // 13 Apr 2026 local

describe('repairDateScalar', () => {
	it('leaves valid ISO unchanged', () => {
		expect(repairDateScalar('2026-04-13', FIXED)).toEqual({
			next: '2026-04-13',
			changed: false
		});
	});

	it('converts DD Mon YY to ISO', () => {
		const r = repairDateScalar('13 Apr 26', FIXED);
		expect(r.changed).toBe(true);
		expect(r.next).toBe('2026-04-13');
	});

	it('converts DD Mon using reference year', () => {
		const r = repairDateScalar('13 Apr', FIXED);
		expect(r.changed).toBe(true);
		expect(r.next).toBe('2026-04-13');
	});

	it('converts D Month YYYY to ISO', () => {
		const r = repairDateScalar('1 April 2026', FIXED);
		expect(r.changed).toBe(true);
		expect(r.next).toBe('2026-04-01');
	});

	it('replaces invalid ISO-shaped value with empty', () => {
		const r = repairDateScalar('2026-13-40', FIXED);
		expect(r.changed).toBe(true);
		expect(r.next).toBe('');
	});

	it('replaces XX placeholders with empty', () => {
		const r = repairDateScalar('13 Apr XX', FIXED);
		expect(r.changed).toBe(true);
		expect(r.next).toBe('');
	});

	it('replaces non-ISO strings with empty', () => {
		expect(repairDateScalar('TBD', FIXED)).toEqual({ next: '', changed: true });
	});

	it('does not fill empty strings', () => {
		expect(repairDateScalar('', FIXED)).toEqual({ next: '', changed: false });
		expect(repairDateScalar('   ', FIXED)).toEqual({ next: '   ', changed: false });
	});
});

describe('runClientDocumentRepairs', () => {
	it('exports the known repair IDs', () => {
		expect(CLIENT_DOCUMENT_REPAIR_IDS).toContain('legacy-dates-to-iso');
	});
});
