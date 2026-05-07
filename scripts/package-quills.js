#!/usr/bin/env node

/**
 * Package Quills Script
 *
 * Builds @airmark/quiver into the static runtime artifact consumed by the web app.
 *
 * Input:  ./node_modules/@airmark/quiver  (or QUILL_SRC_DIR override)
 * Output: ./static/quills/{Quiver.json, manifest.<hash>.json, <name>@<ver>.<hash>.zip, store/}
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Quiver } from '@quillmark/quiver/node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const QUIVER_SRC_DIR = process.env.QUILL_SRC_DIR ? path.resolve(process.env.QUILL_SRC_DIR) : null;
const QUILLS_OUTPUT_DIR = path.join(PROJECT_ROOT, 'static', 'quills');

async function packageQuills() {
	console.log('📦 Packaging Quills...\n');

	await fs.promises.rm(QUILLS_OUTPUT_DIR, { recursive: true, force: true });
	await fs.promises.mkdir(QUILLS_OUTPUT_DIR, { recursive: true });

	let quiver;
	if (QUIVER_SRC_DIR) {
		console.log(`[pack:quills] using local source: ${QUIVER_SRC_DIR}`);
		if (!fs.existsSync(QUIVER_SRC_DIR)) {
			throw new Error(`Quiver source directory does not exist: ${QUIVER_SRC_DIR}`);
		}
		// ZIP's DOS date format only supports 1980-2099. Some publish pipelines emit
		// files with mtime = 0 (1970), which makes Quiver.build() throw an opaque
		// "date not in range 1980-2099". Clamp any out-of-range mtimes to now.
		await normalizeMtimes(QUIVER_SRC_DIR);
		await Quiver.build(QUIVER_SRC_DIR, QUILLS_OUTPUT_DIR);
		quiver = await Quiver.fromDir(QUIVER_SRC_DIR);
	} else {
		await Quiver.buildPackage('@airmark/quiver', QUILLS_OUTPUT_DIR);
		quiver = await Quiver.fromPackage('@airmark/quiver');
	}

	const names = quiver.quillNames();
	console.log(`\n✅ Quill packaging complete!`);
	console.log(`Output directory: ${QUILLS_OUTPUT_DIR}`);
	console.log(`Packaged ${names.length} Quill(s):`);
	for (const name of names) {
		for (const version of quiver.versionsOf(name)) {
			console.log(`  - ${name}@${version}`);
		}
	}
}

async function normalizeMtimes(dir) {
	const MIN = new Date('1980-01-01T00:00:00Z').getTime();
	const MAX = new Date('2099-12-31T23:59:59Z').getTime();
	const now = new Date();
	let fixed = 0;

	async function walk(p) {
		const st = await fs.promises.lstat(p);
		if (st.isSymbolicLink()) return;
		const ms = st.mtimeMs;
		if (ms < MIN || ms > MAX) {
			await fs.promises.utimes(p, now, now);
			fixed++;
		}
		if (st.isDirectory()) {
			for (const entry of await fs.promises.readdir(p)) {
				await walk(path.join(p, entry));
			}
		}
	}

	await walk(dir);
	if (fixed > 0) {
		console.log(`[pack:quills] normalized mtimes on ${fixed} file(s) outside 1980-2099`);
	}
}

packageQuills().catch((error) => {
	console.error('\n❌ Error packaging Quills:', error);
	process.exit(1);
});
