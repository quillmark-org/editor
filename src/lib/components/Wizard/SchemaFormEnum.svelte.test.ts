import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent, page } from '@vitest/browser/context';
import SchemaForm from './SchemaForm.svelte';

describe('SchemaForm Enum Support', () => {
	const enumSchema = {
		fields: {
			color: {
				type: 'string' as const,
				description: 'Pick a color',
				enum: ['Red', 'Green', 'Blue'],
				default: 'Red',
				required: true
			}
		}
	};

	const optionalEnumSchema = {
		fields: {
			color: {
				type: 'string' as const,
				description: 'Pick a color',
				enum: ['Red', 'Green', 'Blue']
			}
		}
	};

	it('renders dropdown for enum fields', async () => {
		render(SchemaForm, {
			schema: enumSchema,
			data: { color: 'Red' }
		});

		// Current implementation uses BaseSelect which renders a hidden button as trigger
		// We'll look for the trigger button
		const colorTrigger = page.getByRole('combobox', { name: /color/i });
		await expect.element(colorTrigger).toBeVisible();
		await expect.element(colorTrigger).toHaveTextContent(/Red/i);
	});

	it('renders options when clicked', async () => {
		render(SchemaForm, {
			schema: enumSchema,
			data: { color: 'Red' }
		});

		const colorTrigger = page.getByRole('combobox', { name: /color/i });
		await colorTrigger.click();

		// Options should be visible
		// BaseSelect renders options in a portal or relative div, check for text
		await expect.element(page.getByText('Green')).toBeVisible();
		await expect.element(page.getByText('Blue')).toBeVisible();
	});

	it('updates value on selection', async () => {
		const data = { color: 'Red' };

		render(SchemaForm, {
			schema: enumSchema,
			data: data
		});

		const colorTrigger = page.getByRole('combobox', { name: /color/i });
		await colorTrigger.click();

		const greenOption = page.getByRole('option', { name: 'Green' });
		await greenOption.click();

		// Check if display updated
		await expect.element(colorTrigger).toHaveTextContent(/Green/i);
	});

	it('allows deselecting a non-required enum field by clicking the selected option', async () => {
		render(SchemaForm, {
			schema: optionalEnumSchema,
			data: { color: 'Red' }
		});

		const colorTrigger = page.getByRole('combobox', { name: /color/i });
		await colorTrigger.click();

		// Click the already-selected option to deselect
		const redOption = page.getByRole('option', { name: 'Red' });
		await redOption.click();

		// Should show placeholder instead of Red
		await expect.element(colorTrigger).toHaveTextContent(/Select/i);
	});

	it('does not allow deselecting a required enum field', async () => {
		render(SchemaForm, {
			schema: enumSchema,
			data: { color: 'Red' }
		});

		const colorTrigger = page.getByRole('combobox', { name: /color/i });
		await colorTrigger.click();

		// Click the already-selected option
		const redOption = page.getByRole('option', { name: 'Red' });
		await redOption.click();

		// Should still show Red (not deselected)
		await expect.element(colorTrigger).toHaveTextContent(/Red/i);
	});

	it('closes enum dropdown on Escape key', async () => {
		render(SchemaForm, {
			schema: enumSchema,
			data: { color: 'Red' }
		});

		const colorTrigger = page.getByRole('combobox', { name: /color/i });
		await colorTrigger.click();
		await expect.element(colorTrigger).toHaveAttribute('aria-expanded', 'true');

		await userEvent.keyboard('{Escape}');
		await expect.element(colorTrigger).toHaveAttribute('aria-expanded', 'false');
	});
});
