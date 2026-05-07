import { describe, it, expect } from 'vitest';
import { loadTemplate } from './loader';

describe('loadTemplate', () => {
	it('loads a template from the templates directory', async () => {
		const content = await loadTemplate('usaf_template.md');
		expect(content.length).toBeGreaterThan(0);
	});

	it('rejects path traversal filenames', async () => {
		await expect(loadTemplate('../../package.json')).rejects.toThrow(
			'Path traversal detected in template filename'
		);
	});
});
