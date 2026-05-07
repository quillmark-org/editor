import { describe, it, expect } from 'vitest';
import { getSchemaDefaults } from './card-schema-utils';

describe('getSchemaDefaults', () => {
	it('returns empty object for null/undefined schema', () => {
		expect(getSchemaDefaults(null)).toEqual({});
		expect(getSchemaDefaults(undefined)).toEqual({});
	});

	it('returns empty object for schema with no fields', () => {
		expect(getSchemaDefaults({})).toEqual({});
	});

	it('extracts default values from fields', () => {
		const schema = {
			fields: {
				name: { type: 'string', default: 'untitled' },
				count: { type: 'integer', default: 0 },
				flag: { type: 'boolean', default: true }
			}
		};
		expect(getSchemaDefaults(schema)).toEqual({
			name: 'untitled',
			count: 0,
			flag: true
		});
	});

	it('prefers const over default', () => {
		const schema = {
			fields: {
				kind: { type: 'string', const: 'fixed', default: 'other' }
			}
		};
		expect(getSchemaDefaults(schema)).toEqual({ kind: 'fixed' });
	});

	it('skips fields without const or default', () => {
		const schema = {
			fields: {
				a: { type: 'string', default: 'x' },
				b: { type: 'string' }
			}
		};
		expect(getSchemaDefaults(schema)).toEqual({ a: 'x' });
	});

	it('provides {} for required type:object fields without explicit default', () => {
		const schema = {
			fields: {
				meta: { type: 'object', required: true },
				other: { type: 'object' }
			}
		};
		expect(getSchemaDefaults(schema)).toEqual({ meta: {} });
	});
});
