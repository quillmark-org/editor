#!/usr/bin/env node
/**
 * Build the release PR body from CHANGELOG.md + package.json.
 *
 * Single source of truth for the release PR description. Used by:
 *   - .github/workflows/release-prepare.yml (initial PR creation)
 *   - .github/workflows/release-sync.yml (re-sync on every push to release/*)
 *
 * Usage:
 *   node scripts/build-pr-body.js              # prints body to stdout
 *   import { buildPrBody } from './build-pr-body.js'
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractLatestEntry } from './apply-changelog.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function buildPrBody() {
	const entry = extractLatestEntry();
	const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));

	return [
		entry,
		'',
		'---',
		'',
		'**Review checklist**',
		'',
		'- [ ] Changelog entry is accurate and user-facing',
		`- [ ] Version in \`package.json\` is correct (\`${pkg.version}\`)`,
		'',
		'> Edit `CHANGELOG.md` on this branch to revise the entry. This PR description re-syncs on every push.'
	].join('\n');
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
	try {
		process.stdout.write(buildPrBody() + '\n');
	} catch (err) {
		console.error(`Error: ${err.message}`);
		process.exit(1);
	}
}
