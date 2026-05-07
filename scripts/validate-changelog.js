#!/usr/bin/env node
/**
 * Validate CHANGELOG.next.md against the Keep a Changelog format
 * defined in .claude/skills/changelog/SKILL.md.
 *
 * Exits 0 if valid, 1 if validation fails.
 * Accepts an optional positional arg for the file path (defaults to CHANGELOG.next.md).
 *
 * Usage:
 *   node scripts/validate-changelog.js
 *   node scripts/validate-changelog.js path/to/file.md
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const filePath = resolve(ROOT, process.argv[2] || 'CHANGELOG.next.md');

const ALLOWED_SECTIONS = new Set([
	'Added',
	'Changed',
	'Fixed',
	'Removed',
	'Security',
	'From your feedback'
]);

const errors = [];
const warnings = [];

function fail(msg) {
	errors.push(msg);
}

// ── Read file ───────────────────────────────────────────────────────────────

let raw;
try {
	raw = readFileSync(filePath, 'utf8');
} catch {
	fail(`File not found: ${filePath}`);
	report();
}

const lines = raw.split('\n');

// ── 1. No preamble before the header ────────────────────────────────────────

const firstNonEmpty = lines.findIndex((l) => l.trim() !== '');
if (firstNonEmpty === -1) {
	fail('File is empty.');
	report();
}

if (!lines[firstNonEmpty].startsWith('## [v')) {
	fail(
		`File must start with a version header (## [vX.Y.Z]). ` +
			`Found: "${lines[firstNonEmpty].slice(0, 80)}"`
	);
}

// ── 2. Version header format ────────────────────────────────────────────────

const headerMatch = raw.match(/^## \[v(\d+\.\d+\.\d+)\]/m);
if (!headerMatch) {
	fail('Missing or malformed version header. Expected: ## [vX.Y.Z]');
	report();
}

const version = headerMatch[1];

// If branch name is available (CI), verify it matches
const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || '';
if (branch.startsWith('release/v')) {
	const branchVersion = branch.replace('release/v', '');
	if (branchVersion !== version) {
		fail(`Version mismatch: header says v${version} but branch is ${branch}`);
	}
}

// ── 3. Only one version header ──────────────────────────────────────────────

const headerCount = (raw.match(/^## \[/gm) || []).length;
if (headerCount > 1) {
	fail(`Expected exactly one ## [vX.Y.Z] header, found ${headerCount}.`);
}

// ── 4. Section names ────────────────────────────────────────────────────────

const sectionHeaders = [...raw.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim());
const unknownSections = sectionHeaders.filter((s) => !ALLOWED_SECTIONS.has(s));
if (unknownSections.length > 0) {
	fail(
		`Unknown section(s): ${unknownSections.map((s) => `"### ${s}"`).join(', ')}. Allowed: ${[...ALLOWED_SECTIONS].join(', ')}`
	);
}

// ── 5. No empty sections ────────────────────────────────────────────────────

for (const section of sectionHeaders) {
	const re = new RegExp(`^### ${section}\\s*\\n([\\s\\S]*?)(?=^###|^## |$(?!\\n))`, 'gm');
	const match = re.exec(raw);
	if (match) {
		const body = match[1].trim();
		if (!body) {
			fail(`Section "### ${section}" is empty — remove it or add content.`);
		}
	}
}

// ── 6. At least one section with content ────────────────────────────────────

if (sectionHeaders.length === 0) {
	fail('No ### sections found. Need at least one of: Added, Changed, Fixed, Removed, Security.');
}

// ── 7. Bullet format ────────────────────────────────────────────────────────

const bulletLines = lines.filter((l) => /^\s*[-*]\s/.test(l));
if (bulletLines.length === 0 && sectionHeaders.length > 0) {
	fail('No bullet items found under any section.');
}

// ── 8. No code fences (AI sometimes wraps output in ```) ────────────────────

if (/^```/m.test(raw)) {
	fail('Contains code fences (```). Output should be raw markdown only.');
}

// ── 9. No obvious AI preamble patterns ──────────────────────────────────────

const preamblePatterns = [
	/^(I will|I'll|Let me|I need to|I should|First,|Here's|Here is)/im,
	/^(Based on|Looking at|Analyzing)/im
];

for (const pattern of preamblePatterns) {
	const match = raw.match(pattern);
	if (match) {
		fail(
			`Detected likely AI preamble: "${match[0]}...". Output must be raw changelog markdown only.`
		);
		break;
	}
}

// ── Report ──────────────────────────────────────────────────────────────────

function report() {
	if (warnings.length > 0) {
		console.error(`\n⚠  Warnings:`);
		for (const w of warnings) console.error(`   - ${w}`);
	}

	if (errors.length > 0) {
		console.error(`\n✗  CHANGELOG.next.md validation failed (${errors.length} error(s)):\n`);
		for (const e of errors) console.error(`   • ${e}`);
		console.error('');
		process.exit(1);
	}

	console.log(`✓  CHANGELOG.next.md is valid (v${version})`);
	process.exit(0);
}

report();
