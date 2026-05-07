#!/usr/bin/env node
/**
 * Playwright snapshot script for @quillmark/editor aesthetic review.
 *
 * Prerequisites:
 *   npx playwright install chromium   (done automatically by the aesthetic-review skill)
 *   npm run dev                        (dev server must be running at GALLERY_URL)
 *
 * Usage:
 *   node scripts/snapshot.js
 *
 * Outputs PNGs to .snapshots/ in the project root.
 * GALLERY_URL defaults to http://localhost:5173/_dev/gallery but can be overridden:
 *   GALLERY_URL=http://localhost:4173/_dev/gallery node scripts/snapshot.js
 */

import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, '.snapshots');
const GALLERY_URL = process.env.GALLERY_URL ?? 'http://localhost:5173/_dev/gallery';
const TIMEOUT_MS = 10_000;

/** Check whether the dev/preview server is already up. */
async function isServerReady(url) {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
		return res.ok || res.status === 304;
	} catch {
		return false;
	}
}

async function main() {
	const ready = await isServerReady(GALLERY_URL);
	if (!ready) {
		console.error(
			`\n[snapshot] Server not reachable at ${GALLERY_URL}\n` +
				`  → Run \`npm run dev\` in another terminal, then retry.\n` +
				`  → Or set GALLERY_URL to point at a running preview server.\n`
		);
		process.exit(1);
	}

	if (!existsSync(OUT_DIR)) {
		await mkdir(OUT_DIR, { recursive: true });
	}

	const browser = await chromium.launch();

	try {
		// ── Light mode ──────────────────────────────────────────────────────────
		const lightCtx = await browser.newContext({ colorScheme: 'light' });
		const lightPage = await lightCtx.newPage();
		lightPage.setDefaultTimeout(TIMEOUT_MS);

		await lightPage.goto(GALLERY_URL, { waitUntil: 'networkidle' });

		// Full-page shot (light)
		await lightPage.screenshot({
			path: path.join(OUT_DIR, 'gallery-light-full.png'),
			fullPage: true
		});
		console.log('[snapshot] gallery-light-full.png');

		// Per-section shots (light)
		await captureSection(lightPage, 'MarkdownEditor — Empty', 'section-empty-light.png', OUT_DIR);
		await captureSection(lightPage, 'MarkdownEditor — With Content', 'section-content-light.png', OUT_DIR);
		await captureSection(lightPage, 'EditorBlock — Card Container', 'section-card-light.png', OUT_DIR);
		await captureSection(lightPage, 'EditorModeSwitch', 'section-modeswitch-light.png', OUT_DIR);

		await lightCtx.close();

		// ── Dark mode ───────────────────────────────────────────────────────────
		const darkCtx = await browser.newContext({ colorScheme: 'dark' });
		const darkPage = await darkCtx.newPage();
		darkPage.setDefaultTimeout(TIMEOUT_MS);

		await darkPage.goto(GALLERY_URL, { waitUntil: 'networkidle' });
		// Toggle dark class to activate qm-dark theme
		await darkPage.evaluate(() => document.documentElement.classList.add('qm-dark'));
		await darkPage.waitForTimeout(200);

		await darkPage.screenshot({
			path: path.join(OUT_DIR, 'gallery-dark-full.png'),
			fullPage: true
		});
		console.log('[snapshot] gallery-dark-full.png');

		await captureSection(darkPage, 'MarkdownEditor — Empty', 'section-empty-dark.png', OUT_DIR);
		await captureSection(darkPage, 'MarkdownEditor — With Content', 'section-content-dark.png', OUT_DIR);
		await captureSection(darkPage, 'EditorBlock — Card Container', 'section-card-dark.png', OUT_DIR);
		await captureSection(darkPage, 'EditorModeSwitch', 'section-modeswitch-dark.png', OUT_DIR);

		await darkCtx.close();
	} finally {
		await browser.close();
	}

	console.log(`\n[snapshot] Done. PNGs written to .snapshots/`);
}

/**
 * Find a gallery section by its h2 heading text and screenshot it.
 * Falls back to a viewport-only screenshot if the heading isn't found.
 */
async function captureSection(page, headingText, filename, outDir) {
	const heading = page.locator('h2', { hasText: headingText }).first();
	const section = heading.locator('xpath=ancestor::section').first();

	const outPath = path.join(outDir, filename);
	try {
		await section.screenshot({ path: outPath });
	} catch {
		// Heading not found or section not visible — take a full-page fallback
		await page.screenshot({ path: outPath, fullPage: true });
	}
	console.log(`[snapshot] ${filename}`);
}

main().catch((err) => {
	console.error('[snapshot] Fatal:', err);
	process.exit(1);
});
