#!/usr/bin/env node
/**
 * Deployment readiness check.
 *
 * Usage:
 *   node scripts/check-deployment.js [path/to/config.yaml]
 *   node scripts/check-deployment.js deployments/airmark.yaml
 *
 * Validates the YAML against the schema, walks SECRET_REQUIREMENTS,
 * and reports:
 *   - Whether the YAML parses
 *   - Which env vars the cascade requires for this YAML
 *   - Which of those are present in process.env (load .env-style files
 *     yourself before invoking, or pipe `set -a; source .env; ...`)
 *
 * Exit code: 0 if ready to boot, 1 if anything is missing or invalid.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ConfigSchema, SECRET_REQUIREMENTS } from '../src/lib/config/schema.ts';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const path = process.argv[2] ?? 'deployments/dev.yaml';
const abs = resolve(path);

console.log(`${BOLD}Checking deployment: ${path}${RESET}\n`);

let raw;
try {
	raw = readFileSync(abs, 'utf8');
} catch (err) {
	console.error(`${RED}✗ Cannot read ${abs}${RESET}\n  ${err.message}`);
	process.exit(1);
}

const result = ConfigSchema.safeParse(parseYaml(raw));
if (!result.success) {
	console.error(`${RED}✗ Schema validation failed:${RESET}`);
	for (const issue of result.error.issues) {
		console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
	}
	process.exit(1);
}
console.log(`${GREEN}✓ Schema valid${RESET}`);

const cfg = result.data;

console.log(`\n${BOLD}Resolved profile:${RESET}`);
console.log(`  brand:          ${cfg.brand.displayFull}`);
console.log(`  classification: ${cfg.classification.category}`);
console.log(`  guestMode:      ${cfg.auth.guestMode}`);
const enabledProviders = [];
for (const [k, p] of Object.entries(cfg.auth.providers)) {
	if (k === 'oidc') {
		if (p) enabledProviders.push(`oidc(${p.id})`);
	} else if (p) {
		enabledProviders.push(k);
	}
}
console.log(`  providers:      ${enabledProviders.join(', ') || '(none)'}`);
console.log(`  feedback:       ${cfg.features.feedback.upstream}`);
console.log(`  db.driver:      ${cfg.db.driver}`);

const required = [];
for (const req of SECRET_REQUIREMENTS) {
	if (req.when(cfg)) {
		for (const v of req.vars(cfg)) required.push({ name: v, reason: req.description });
	}
}

console.log(`\n${BOLD}Required env secrets (cascade):${RESET}`);
if (required.length === 0) {
	console.log(`  ${DIM}(none)${RESET}`);
} else {
	const missing = [];
	for (const { name, reason } of required) {
		const present = !!process.env[name];
		const marker = present ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
		const valueHint = present ? `${DIM}(set)${RESET}` : `${YELLOW}MISSING${RESET}`;
		console.log(`  ${marker} ${name.padEnd(28)} ${valueHint}  ${DIM}— ${reason}${RESET}`);
		if (!present) missing.push(name);
	}

	if (missing.length) {
		console.error(`\n${RED}✗ Boot would fail. Missing: ${missing.join(', ')}${RESET}`);
		process.exit(1);
	}
}

console.log(`\n${GREEN}${BOLD}✓ Ready to boot.${RESET}`);
