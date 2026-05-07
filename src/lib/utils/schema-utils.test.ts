import { describe, expect, it } from 'vitest';
import { schemaHasRenderableFormFields } from './schema-utils';

describe('schemaHasRenderableFormFields', () => {
	it('returns false when only CARD (reserved) exists', () => {
		expect(
			schemaHasRenderableFormFields({
				fields: {
					CARD: { type: 'string', const: 'note' }
				}
			})
		).toBe(false);
	});

	it('returns true when a normal property exists', () => {
		expect(
			schemaHasRenderableFormFields({
				fields: {
					CARD: { type: 'string' },
					title: { type: 'string' }
				}
			})
		).toBe(true);
	});

	it('returns false when x-card-only properties exist', () => {
		expect(
			schemaHasRenderableFormFields({
				fields: {
					body: { type: 'string', 'x-card': true }
				}
			})
		).toBe(false);
	});

	it('returns false when every field is hidden by showWhen', () => {
		expect(
			schemaHasRenderableFormFields(
				{
					fields: {
						detail: {
							type: 'string',
							ui: { showWhen: { field: 'kind', value: 'other' } }
						}
					}
				},
				{ kind: 'main' }
			)
		).toBe(false);
	});

	it('returns true when showWhen allows a field', () => {
		expect(
			schemaHasRenderableFormFields(
				{
					fields: {
						detail: {
							type: 'string',
							ui: { showWhen: { field: 'kind', value: 'other' } }
						}
					}
				},
				{ kind: 'other' }
			)
		).toBe(true);
	});
});
