#!/usr/bin/env node
/**
 * Generate a CHANGELOG.next.md entry using the Anthropic API.
 *
 * Builds an inline prompt, combines it with the commit log,
 * and asks Claude to produce a changelog entry.
 *
 * Environment:
 *   ANTHROPIC_API_KEY  — required
 *
 * Usage:
 *   node scripts/generate-changelog.js <version> [since-tag]
 *
 * Outputs raw markdown to stdout.
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const version = process.argv[2];
const sinceTag = process.argv[3] || '';

if (!version) {
	console.error('Usage: generate-changelog.js <version> [since-tag]');
	process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
	console.error('Error: ANTHROPIC_API_KEY environment variable is required.');
	process.exit(1);
}

// ── Build the prompt ────────────────────────────────────────────────────────

const prompt = [
	'Generate one changelog entry from the provided version and commit list.',
	'',
	'Rules:',
	'- Use `## [vX.Y.Z]` and only non-empty `### Added` / `### Changed` / `### Fixed` / `### Removed` / `### Security` sections',
	'- Rewrite commit text into concise plain-English bullets (do not paste commit messages)',
	'- Include only end-user-visible changes',
	'- Omit internal-only work (CI/CD, release/deploy plumbing, maintenance, no-op refactors, version-only bumps)',
	'- If unclear whether a change is user-facing, omit it',
	'',
	'Output markdown only. No preamble, fences, or commentary.',
	'',
	'Example shape:',
	'```md',
	'## [vX.Y.Z]',
	'',
	'### Fixed',
	'- Improve editor load time for large documents.',
	'```'
].join('\n');

// Use execFileSync so grep patterns with () / [] are not parsed by /bin/sh (breaks in CI on Linux).
function gitLogCommitMessages() {
	const args = [
		'log',
		...(sinceTag ? [`${sinceTag}..HEAD`] : []),
		'--pretty=format:- %s (%h)%n%b',
		'--no-merges',
		// Exclude CI/CD commits by conventional-commit type prefix and common CI patterns.
		// --invert-grep with multiple --grep flags excludes commits matching ANY pattern.
		'--invert-grep',
		'--grep=^ci[:(]',
		'--grep=^cd[:(]',
		'--grep=^chore(ci)',
		'--grep=^chore(cd)',
		'--grep=^build(ci)'
	];
	return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

const commitLog = gitLogCommitMessages();

const userMessage = [
	prompt,
	'',
	'## Input',
	'',
	`Target version: v${version}`,
	sinceTag ? `Changes since: ${sinceTag}` : 'Changes: full history (no previous tags)',
	'',
	'### Commits',
	'',
	commitLog || '(no commits found)'
].join('\n');

// ── Call Anthropic API ──────────────────────────────────────────────────────

const body = JSON.stringify({
	model: 'claude-haiku-4-5-20251001',
	max_tokens: 2048,
	messages: [
		{
			role: 'user',
			content: userMessage
		}
	]
});

const response = await fetch('https://api.anthropic.com/v1/messages', {
	method: 'POST',
	headers: {
		'Content-Type': 'application/json',
		'x-api-key': process.env.ANTHROPIC_API_KEY,
		'anthropic-version': '2023-06-01'
	},
	body
});

if (!response.ok) {
	const text = await response.text();
	console.error(`Anthropic API error (${response.status}): ${text}`);
	process.exit(1);
}

const data = await response.json();
const content = data.content?.[0]?.text;

if (!content) {
	console.error('Error: Empty response from Anthropic API.');
	console.error(JSON.stringify(data, null, 2));
	process.exit(1);
}

process.stdout.write(content.trim() + '\n');
