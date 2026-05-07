#!/usr/bin/env node
/**
 * Apply a pending release's CHANGELOG.next.md into CHANGELOG.md,
 * or extract the latest entry from CHANGELOG.md.
 *
 * Exit codes:
 *   0  — success
 *   1  — CHANGELOG.next.md not present (not a release commit)
 *   2  — unexpected error
 *
 * Usage:
 *   node scripts/apply-changelog.js              # apply CHANGELOG.next.md → CHANGELOG.md
 *   node scripts/apply-changelog.js --extract    # print latest entry from CHANGELOG.md
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function applyChangelog() {
	const draftPath = resolve(ROOT, 'CHANGELOG.next.md');
	const changelogPath = resolve(ROOT, 'CHANGELOG.md');

	if (!existsSync(draftPath)) {
		return { applied: false, reason: 'no-draft' };
	}

	const entry = readFileSync(draftPath, 'utf8').trim();
	if (!entry) {
		throw new Error('CHANGELOG.next.md is empty');
	}

	const existing = readFileSync(changelogPath, 'utf8');
	const lines = existing.split('\n');

	// Find the first existing version section (line starting with "## [")
	const firstEntryIdx = lines.findIndex((line) => /^## \[/.test(line));

	let updated;
	if (firstEntryIdx === -1) {
		// No existing entries — append after whatever header the file has
		updated = existing.trimEnd() + '\n\n' + entry + '\n';
	} else {
		const header = lines.slice(0, firstEntryIdx).join('\n').trimEnd();
		const rest = lines.slice(firstEntryIdx).join('\n');
		updated = `${header}\n\n${entry}\n\n${rest}`;
	}

	writeFileSync(changelogPath, updated);
	unlinkSync(draftPath);

	return { applied: true, entry };
}

export function extractLatestEntry() {
	const changelogPath = resolve(ROOT, 'CHANGELOG.md');
	const content = readFileSync(changelogPath, 'utf8');
	const lines = content.split('\n');
	const headers = lines.reduce((acc, l, i) => (l.startsWith('## [') ? [...acc, i] : acc), []);
	if (headers.length === 0) throw new Error('No version entries found in CHANGELOG.md');
	const end = headers[1] ?? lines.length;
	return lines.slice(headers[0], end).join('\n').trimEnd();
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
	if (process.argv[2] === '--extract') {
		try {
			process.stdout.write(extractLatestEntry() + '\n');
		} catch (err) {
			console.error(`Error: ${err.message}`);
			process.exit(2);
		}
	} else {
		try {
			const result = applyChangelog();
			if (!result.applied) {
				console.error('No CHANGELOG.next.md — not a release commit.');
				process.exit(1);
			}
			process.stdout.write(result.entry + '\n');
		} catch (err) {
			console.error(`Error: ${err.message}`);
			process.exit(2);
		}
	}
}
