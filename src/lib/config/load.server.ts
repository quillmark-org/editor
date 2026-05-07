/**
 * Deployment config loader.
 *
 * Taxonomy:
 *   - YAML carries every behavioral knob (brand, classification, auth toggles,
 *     features, db driver). One file per deployment in deployments/*.yaml.
 *   - Env carries secrets (AUTH_*, DATABASE_URL, FEEDBACK_*_KEY, ...) and one
 *     bootstrap pointer: CONFIG_PATH, which selects the YAML.
 *
 * CONFIG_PATH is the only env var that influences behavior, and it does so
 * indirectly — it just tells the process where to find the YAML. Putting it
 * in YAML would be circular. Every other "is X enabled?" decision lives in
 * the YAML and drives env-var validation via the SECRET_REQUIREMENTS registry
 * declared next to the schema.
 *
 * CONFIG_PATH is required. There is deliberately no default: a missing value
 * fails fast at boot rather than silently picking up `dev.yaml` (which would
 * boot a production deploy with mock auth and guest mode on). Local dev sets
 * it via `.env.dev`, which Vite auto-loads with `--mode dev`.
 *
 * CONFIG_PATH resolution: relative paths resolve against process.cwd().
 * In dev (`npm run dev`) and the standard production entrypoint, CWD is
 * the repo root, so `deployments/airmark.yaml` works. Non-standard
 * launchers (systemd units with `WorkingDirectory=` unset, custom Docker
 * entrypoints) must use an absolute path.
 *
 * Bundling note: `@vercel/nft` (used by adapter-vercel) only traces files
 * reached by static imports. A runtime `readFileSync` would leave the YAMLs
 * out of the function bundle, so we statically inline every `deployments/
 * *.yaml` via `import.meta.glob` + `?raw`. The runtime falls back to a real
 * filesystem read when CONFIG_PATH does not match any bundled file (absolute
 * paths, custom mount points, test fixtures in tmpdir).
 *
 * Call-site convention: `getServerConfig()` is a cheap getter on a frozen,
 * module-cached object after first call. Call it inline at the use site;
 * do not memoize the result locally. Top-level module-scope reads are
 * also fine — the cache is populated lazily on first call.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ConfigSchema, SECRET_REQUIREMENTS, type Config } from './schema';

const BUNDLED_YAMLS = import.meta.glob('/deployments/*.yaml', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

let cached: Config | undefined;

function lookupBundled(configPath: string): string | undefined {
	const key = configPath.startsWith('/') ? configPath : '/' + configPath.replace(/^\.\//, '');
	return BUNDLED_YAMLS[key];
}

export function getServerConfig(): Config {
	if (cached) return cached;
	const configPath = process.env.CONFIG_PATH;
	if (!configPath) {
		throw new Error(
			'CONFIG_PATH is not set. Point it at a deployments/*.yaml file ' +
				'(e.g., CONFIG_PATH=deployments/dev.yaml). For local dev, .env.dev sets this for you.'
		);
	}
	const bundled = lookupBundled(configPath);
	const path = bundled !== undefined ? configPath : resolve(configPath);
	let raw: string;
	if (bundled !== undefined) {
		raw = bundled;
	} else {
		try {
			raw = readFileSync(path, 'utf8');
		} catch (err) {
			throw new Error(
				`Failed to read deployment config at ${path}. ` + `Cause: ${(err as Error).message}`
			);
		}
	}
	const result = ConfigSchema.safeParse(parseYaml(raw));
	if (!result.success) {
		const issues = result.error.issues
			.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
			.join('\n');
		throw new Error(`Invalid deployment config at ${path}:\n${issues}`);
	}
	assertSecretsForToggles(result.data, path);
	cached = deepFreeze(result.data);
	return cached;
}

/** Reset the module-level cache. Tests only. */
export function resetServerConfig(): void {
	cached = undefined;
}

/**
 * Recursively freeze every nested object/array. `Object.freeze` is shallow,
 * so without this any caller could mutate `cfg.auth.providers.github = true`
 * at runtime and silently flip behavior for the rest of the process.
 */
function deepFreeze<T>(value: T): T {
	if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
	for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
	return Object.freeze(value);
}

function assertSecretsForToggles(cfg: Config, path: string): void {
	const missing = new Set<string>();
	for (const req of SECRET_REQUIREMENTS) {
		if (!req.when(cfg)) continue;
		for (const v of req.vars(cfg)) if (!process.env[v]) missing.add(v);
	}
	if (missing.size) {
		throw new Error(
			`Deployment config at ${path} requires env secrets that are not set: ${[...missing].join(', ')}`
		);
	}
}
