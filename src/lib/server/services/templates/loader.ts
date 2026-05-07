/**
 * Server-Side Template Loader
 * Loads template files from the filesystem or via HTTP (for serverless deployments).
 */

import { readFile } from 'fs/promises';
import { relative, resolve } from 'path';

export interface ManifestEntry {
	id: string;
	name: string;
	description: string;
	file: string;
	production: boolean;
}

/**
 * Validate that a template filename does not escape the templates directory.
 */
function assertSafeFilename(filename: string): void {
	const templatesDir = resolve(process.cwd(), 'static', 'templates');
	const templatePath = resolve(templatesDir, filename);
	const relativePath = relative(templatesDir, templatePath);
	const segments = relativePath.split(/[\\/]/);
	if (
		relativePath === '' ||
		relativePath === '.' ||
		relativePath === '..' ||
		relativePath.startsWith('../') ||
		relativePath.startsWith('..\\') ||
		segments.includes('..')
	) {
		throw new Error('Path traversal detected in template filename');
	}
}

/**
 * Load a template file from the local filesystem.
 * @param filename - Template filename (e.g., 'usaf_template.md')
 * @returns Template content as string
 */
export async function loadTemplate(filename: string): Promise<string> {
	assertSafeFilename(filename);
	const templatePath = resolve(process.cwd(), 'static', 'templates', filename);
	return await readFile(templatePath, 'utf-8');
}

/**
 * Fetch the template manifest from a remote URL (e.g., the app's own CDN).
 * Used by the Vercel cron endpoint where static/ files aren't on the filesystem.
 */
export async function loadManifestViaHTTP(baseUrl: string): Promise<ManifestEntry[]> {
	const url = `${baseUrl}templates/templates.json`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status} ${res.statusText}`);
	return res.json();
}

/**
 * Fetch a single template file from a remote URL.
 */
export async function loadTemplateViaHTTP(baseUrl: string, filename: string): Promise<string> {
	if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
		throw new Error('Path traversal detected in template filename');
	}
	if (!/^[A-Za-z0-9_-]+\.[a-z]+$/.test(filename)) {
		throw new Error('Path traversal detected in template filename');
	}
	const url = `${baseUrl}templates/${filename}`;
	const res = await fetch(url);
	if (!res.ok)
		throw new Error(`Failed to fetch template ${filename}: ${res.status} ${res.statusText}`);
	return res.text();
}
