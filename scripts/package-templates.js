#!/usr/bin/env node

/**
 * Package Templates Script
 *
 * Copies template markdown files from in-repo `templates/` to `static/templates/`
 * for static serving and SSR import.
 *
 * Input:  ./templates/*  (or TEMPLATE_SRC_DIR override)
 * Output: ./static/templates/*
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TEMPLATE_SRC_DIR = process.env.TEMPLATE_SRC_DIR
	? path.resolve(process.env.TEMPLATE_SRC_DIR)
	: path.join(PROJECT_ROOT, 'templates');
const TEMPLATES_OUTPUT_DIR = path.join(PROJECT_ROOT, 'static', 'templates');

async function copyFile(sourcePath, destPath) {
	await fs.copyFile(sourcePath, destPath);
	const stats = await fs.stat(destPath);
	console.log(`  ✓ Copied ${path.basename(destPath)} (${stats.size} bytes)`);
}

async function packageTemplates() {
	console.log('📦 Packaging Templates...\n');

	if (process.env.TEMPLATE_SRC_DIR) {
		console.log(`[pack:templates] using local source: ${TEMPLATE_SRC_DIR}`);
	}
	if (!existsSync(TEMPLATE_SRC_DIR)) {
		throw new Error(`Templates source directory does not exist: ${TEMPLATE_SRC_DIR}`);
	}

	await fs.rm(TEMPLATES_OUTPUT_DIR, { recursive: true, force: true });
	await fs.mkdir(TEMPLATES_OUTPUT_DIR, { recursive: true });
	console.log(`Output directory: ${TEMPLATES_OUTPUT_DIR}\n`);

	const entries = await fs.readdir(TEMPLATE_SRC_DIR, { withFileTypes: true });
	const templateFiles = entries.filter((entry) => entry.isFile());

	if (templateFiles.length === 0) {
		console.warn('⚠️  No template files found in', TEMPLATE_SRC_DIR);
		return;
	}

	for (const file of templateFiles) {
		const sourcePath = path.join(TEMPLATE_SRC_DIR, file.name);
		const destPath = path.join(TEMPLATES_OUTPUT_DIR, file.name);
		console.log(`Processing: ${file.name}`);
		await copyFile(sourcePath, destPath);
	}

	console.log(`\n✅ Template packaging complete! Files copied: ${templateFiles.length}`);
}

packageTemplates().catch((error) => {
	console.error('\n❌ Error packaging templates:', error.message);
	process.exit(1);
});
