/**
 * Template Constants Tests
 */

import { describe, it, expect } from 'vitest';
import {
	SYSTEM_USER_ID,
	TEMPLATE_TITLE_MAX_LENGTH,
	TEMPLATE_DESCRIPTION_MAX_LENGTH
} from './constants';

describe('SYSTEM_USER_ID', () => {
	it('should be a valid UUID v4', () => {
		expect(SYSTEM_USER_ID).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
		);
	});
});

describe('template metadata length limits', () => {
	it('should define a reasonable title max length', () => {
		expect(TEMPLATE_TITLE_MAX_LENGTH).toBe(200);
	});

	it('should define a reasonable description max length', () => {
		expect(TEMPLATE_DESCRIPTION_MAX_LENGTH).toBe(2000);
	});
});
