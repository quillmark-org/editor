import { describe, expect, it } from 'vitest';
import { inferOidcClaimsSchema } from './infer-claims-schema';

describe('inferOidcClaimsSchema', () => {
	it('maps primitives and nested objects with sorted keys', () => {
		const input = {
			z: 1,
			a: { nested: true },
			sub: 'x'
		};
		expect(inferOidcClaimsSchema(input)).toEqual({
			a: { nested: 'boolean' },
			sub: 'string',
			z: 'number'
		});
	});

	it('represents arrays by first element', () => {
		expect(inferOidcClaimsSchema([{ a: 1 }])).toEqual([{ a: 'number' }]);
		expect(inferOidcClaimsSchema([])).toEqual(['empty']);
	});
});
