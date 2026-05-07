import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getServerConfig, resetServerConfig } from './load.server';
import { toPublicConfig, type Config } from './schema';

const BRAND_BLOCK = `
brand:
  prefix: t
  suffix: q
  full: tq
  displayFull: TQ
  copyright: TQ
  meta:
    titleTemplate: '%s'
    defaultTitle: tq
    description: d
    keywords: k
    ogSiteName: TQ
  urls:
    website: https://example.com
    about: https://example.com/a
    terms: https://example.com/t
    privacy: https://example.com/p
`;

/** Fully-explicit shape for backwards-compat tests. */
const FULL_YAML = `${BRAND_BLOCK}
classification:
  label: U
  showBanner: false
  bannerTone: unclassified
  useInternalTerms: false
  sessionMaxAgeSeconds: 3600
auth:
  guestMode: true
  providers:
    github: false
    google: false
    mock: true
features:
  mobile: true
  feedback:
    upstream: none
db:
  driver: pglite
`;

/** Minimal shape that exercises Zod defaults for everything optional. */
const MINIMAL_YAML = `${BRAND_BLOCK}
auth:
  guestMode: true
  providers:
    mock: true
db:
  driver: pglite
`;

/** A YAML with OIDC enabled for cascade tests. */
const OIDC_YAML = `${BRAND_BLOCK}
auth:
  guestMode: true
  providers:
    oidc:
      id: tenant-sso
      name: 'Tenant SSO'
      issuer: https://idp.example.com/realms/tenant
      envPrefix: AUTH_TENANT
db:
  driver: pglite
`;

let dir: string;
const ORIG_ENV = process.env;

function writeYaml(content: string): string {
	const path = join(dir, 'config.yaml');
	writeFileSync(path, content);
	return path;
}

function captureBootError(): Error | null {
	try {
		getServerConfig();
		return null;
	} catch (e) {
		return e as Error;
	}
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'cfg-test-'));
	process.env = { ...ORIG_ENV };
	resetServerConfig();
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	process.env = ORIG_ENV;
	resetServerConfig();
});

describe('getServerConfig — CONFIG_PATH requirement', () => {
	it('fails fast when CONFIG_PATH is unset (no silent dev.yaml fallback)', () => {
		delete process.env.CONFIG_PATH;
		expect(() => getServerConfig()).toThrow(/CONFIG_PATH is not set/);
	});
});

describe('getServerConfig — happy path', () => {
	it('parses a fully-explicit YAML and freezes the result', () => {
		process.env.CONFIG_PATH = writeYaml(FULL_YAML);
		const cfg = getServerConfig();
		expect(cfg.brand.full).toBe('tq');
		expect(cfg.db.driver).toBe('pglite');
		expect(Object.isFrozen(cfg)).toBe(true);
	});

	it('caches across calls', () => {
		process.env.CONFIG_PATH = writeYaml(FULL_YAML);
		expect(getServerConfig()).toBe(getServerConfig());
	});
});

describe('getServerConfig — defaults', () => {
	it('applies classification defaults when section is omitted', () => {
		process.env.CONFIG_PATH = writeYaml(MINIMAL_YAML);
		const cfg = getServerConfig();
		expect(cfg.classification.label).toBe('UNCLASSIFIED');
		expect(cfg.classification.showBanner).toBe(false);
		expect(cfg.classification.bannerTone).toBe('unclassified');
		expect(cfg.classification.useInternalTerms).toBe(false);
		expect(cfg.classification.sessionMaxAgeSeconds).toBe(7 * 24 * 60 * 60);
	});

	it('defaults all unspecified auth providers to disabled/null', () => {
		process.env.CONFIG_PATH = writeYaml(MINIMAL_YAML);
		const cfg = getServerConfig();
		expect(cfg.auth.providers.github).toBe(false);
		expect(cfg.auth.providers.google).toBe(false);
		expect(cfg.auth.providers.oidc).toBe(null);
		expect(cfg.auth.providers.mock).toBe(true);
	});

	it('defaults brand.meta.icons to shared static paths', () => {
		process.env.CONFIG_PATH = writeYaml(MINIMAL_YAML);
		const cfg = getServerConfig();
		expect(cfg.brand.meta.icons.favicon).toBe('/favicon.svg');
		expect(cfg.brand.meta.icons.logo).toBe('/logo.svg');
		expect(cfg.brand.meta.icons.pwa192).toBe('/pwa-192x192.png');
		expect(cfg.brand.meta.icons.pwa512).toBe('/pwa-512x512.png');
	});

	it('applies features defaults when section is omitted', () => {
		process.env.CONFIG_PATH = writeYaml(MINIMAL_YAML);
		const cfg = getServerConfig();
		expect(cfg.features.mobile).toBe(true);
		expect(cfg.features.feedback.upstream).toBe('none');
	});
});

describe('getServerConfig — schema validation', () => {
	it('rejects unknown bannerTone', () => {
		process.env.CONFIG_PATH = writeYaml(MINIMAL_YAML + '\nclassification:\n  bannerTone: bogus\n');
		expect(() => getServerConfig()).toThrow(/Invalid deployment config/);
	});

	it('enforces guestMode=false implies at least one provider enabled', () => {
		const yaml = MINIMAL_YAML.replace('guestMode: true', 'guestMode: false').replace(
			'mock: true',
			'mock: false'
		);
		process.env.CONFIG_PATH = writeYaml(yaml);
		expect(() => getServerConfig()).toThrow(/at least one auth provider/);
	});

	it('rejects unknown top-level keys (strict mode)', () => {
		process.env.CONFIG_PATH = writeYaml(MINIMAL_YAML + '\nunknownTopLevel: 1\n');
		expect(() => getServerConfig()).toThrow(/Invalid deployment config/);
	});

	it('rejects unknown nested brand.meta keys (strict mode)', () => {
		// `meta.favicon` is a common typo — the real path is `meta.icons.favicon`.
		const yaml = MINIMAL_YAML.replace('ogSiteName: TQ', 'ogSiteName: TQ\n    favicon: /x.svg');
		process.env.CONFIG_PATH = writeYaml(yaml);
		expect(() => getServerConfig()).toThrow(/Invalid deployment config/);
	});

	it('rejects empty OIDC envPrefix', () => {
		const yaml = OIDC_YAML.replace('envPrefix: AUTH_TENANT', "envPrefix: ''");
		process.env.CONFIG_PATH = writeYaml(yaml);
		expect(() => getServerConfig()).toThrow(/envPrefix/);
	});

	it('rejects lowercase OIDC envPrefix', () => {
		const yaml = OIDC_YAML.replace('envPrefix: AUTH_TENANT', 'envPrefix: auth_tenant');
		process.env.CONFIG_PATH = writeYaml(yaml);
		expect(() => getServerConfig()).toThrow(/envPrefix/);
	});

	it('counts OIDC as a provider for the guestMode refinement', () => {
		const yaml = OIDC_YAML.replace('guestMode: true', 'guestMode: false');
		process.env.CONFIG_PATH = writeYaml(yaml);
		Object.assign(process.env, {
			AUTH_SECRET: 'x',
			AUTH_TENANT_CLIENT_ID: 'x',
			AUTH_TENANT_CLIENT_SECRET: 'x'
		});
		expect(() => getServerConfig()).not.toThrow();
	});

	it('rejects features.mcp.enabled without features.cron.enabled', () => {
		const yaml =
			MINIMAL_YAML +
			`
features:
  mcp:
    enabled: true
`;
		process.env.CONFIG_PATH = writeYaml(yaml);
		process.env.CRON_SECRET = 'x';
		expect(() => getServerConfig()).toThrow(
			/features\.mcp\.enabled requires features\.cron\.enabled/
		);
	});

	it('accepts features.mcp.enabled when features.cron.enabled is also true', () => {
		const yaml =
			MINIMAL_YAML +
			`
features:
  mcp:
    enabled: true
  cron:
    enabled: true
`;
		process.env.CONFIG_PATH = writeYaml(yaml);
		process.env.CRON_SECRET = 'x';
		expect(() => getServerConfig()).not.toThrow();
	});
});

describe('assertSecretsForToggles — cascade', () => {
	it('boots dev (mock-only, pglite, no feedback) with no env', () => {
		process.env.CONFIG_PATH = writeYaml(MINIMAL_YAML);
		expect(() => getServerConfig()).not.toThrow();
	});

	it('requires AUTH_SECRET when any non-mock provider is enabled', () => {
		const yaml = MINIMAL_YAML.replace('mock: true', 'github: true');
		process.env.CONFIG_PATH = writeYaml(yaml);
		process.env.AUTH_GITHUB_ID = 'x';
		process.env.AUTH_GITHUB_SECRET = 'x';
		// AUTH_SECRET deliberately missing
		expect(() => getServerConfig()).toThrow(/AUTH_SECRET/);
	});

	it('derives OIDC env vars from envPrefix in the cascade', () => {
		process.env.CONFIG_PATH = writeYaml(OIDC_YAML);
		// envPrefix is AUTH_TENANT — cascade should require AUTH_TENANT_CLIENT_ID/_SECRET
		const err = captureBootError();
		expect(err?.message).toMatch(/AUTH_TENANT_CLIENT_ID/);
		expect(err?.message).toMatch(/AUTH_TENANT_CLIENT_SECRET/);
		expect(err?.message).toMatch(/AUTH_SECRET/);
	});

	it('uses default AUTH_OIDC envPrefix when none specified', () => {
		const yaml = OIDC_YAML.replace('envPrefix: AUTH_TENANT', '').replace(/\n\s*\n/g, '\n');
		process.env.CONFIG_PATH = writeYaml(yaml);
		const err = captureBootError();
		expect(err?.message).toMatch(/AUTH_OIDC_CLIENT_ID/);
		expect(err?.message).toMatch(/AUTH_OIDC_CLIENT_SECRET/);
	});

	it('requires DATABASE_URL for pg driver', () => {
		process.env.CONFIG_PATH = writeYaml(MINIMAL_YAML.replace('driver: pglite', 'driver: pg'));
		expect(() => getServerConfig()).toThrow(/DATABASE_URL/);
	});

	it('requires DATABASE_URL for neon driver', () => {
		process.env.CONFIG_PATH = writeYaml(MINIMAL_YAML.replace('driver: pglite', 'driver: neon'));
		expect(() => getServerConfig()).toThrow(/DATABASE_URL/);
	});

	it('requires CRON_SECRET when features.cron.enabled is true', () => {
		const yaml = MINIMAL_YAML + '\nfeatures:\n  cron:\n    enabled: true\n';
		process.env.CONFIG_PATH = writeYaml(yaml);
		expect(() => getServerConfig()).toThrow(/CRON_SECRET/);
	});

	it('does not require CRON_SECRET when features.cron is disabled (default)', () => {
		process.env.CONFIG_PATH = writeYaml(MINIMAL_YAML);
		// CRON_SECRET deliberately unset
		expect(() => getServerConfig()).not.toThrow();
	});

	it('does not require CRON_SECRET on non-pglite drivers when cron is disabled', () => {
		process.env.CONFIG_PATH = writeYaml(MINIMAL_YAML.replace('driver: pglite', 'driver: pg'));
		process.env.DATABASE_URL = 'postgres://x';
		// CRON_SECRET deliberately unset; cron defaults to disabled
		expect(() => getServerConfig()).not.toThrow();
	});

	it('requires FEEDBACK_GITHUB_KEY when feedback.upstream=github', () => {
		const yaml = MINIMAL_YAML + '\nfeatures:\n  feedback:\n    upstream: github\n';
		process.env.CONFIG_PATH = writeYaml(yaml);
		expect(() => getServerConfig()).toThrow(/FEEDBACK_GITHUB_KEY/);
	});

	it('requires FEEDBACK_GITLAB_KEY and _URL when feedback.upstream=gitlab', () => {
		const yaml = MINIMAL_YAML + '\nfeatures:\n  feedback:\n    upstream: gitlab\n';
		process.env.CONFIG_PATH = writeYaml(yaml);
		expect(() => getServerConfig()).toThrow(/FEEDBACK_GITLAB_KEY.*FEEDBACK_GITLAB_URL/);
	});

	it('reports all missing secrets in one error', () => {
		const yaml =
			MINIMAL_YAML.replace('driver: pglite', 'driver: pg') +
			'\nfeatures:\n  feedback:\n    upstream: gitlab\n  cron:\n    enabled: true\n';
		process.env.CONFIG_PATH = writeYaml(yaml);
		const err = captureBootError();
		expect(err?.message).toMatch(/FEEDBACK_GITLAB_KEY/);
		expect(err?.message).toMatch(/FEEDBACK_GITLAB_URL/);
		expect(err?.message).toMatch(/DATABASE_URL/);
		expect(err?.message).toMatch(/CRON_SECRET/);
	});

	it('passes when all required secrets are set', () => {
		const yaml =
			MINIMAL_YAML.replace('driver: pglite', 'driver: pg').replace('mock: true', 'github: true') +
			'\nfeatures:\n  feedback:\n    upstream: gitlab\n  cron:\n    enabled: true\n';
		process.env.CONFIG_PATH = writeYaml(yaml);
		Object.assign(process.env, {
			AUTH_SECRET: 'x',
			AUTH_GITHUB_ID: 'x',
			AUTH_GITHUB_SECRET: 'x',
			FEEDBACK_GITLAB_KEY: 'x',
			FEEDBACK_GITLAB_URL: 'https://gitlab.example/api/v4/projects/1',
			DATABASE_URL: 'postgres://x',
			CRON_SECRET: 'x'
		});
		expect(() => getServerConfig()).not.toThrow();
	});
});

/**
 * The schema is intentionally agnostic about classification regimes — CUI is
 * a YAML composition, not a schema concept. These snapshot tests guard the
 * specific deployments that ship as CUI: if someone edits airmark.yaml and
 * drops the banner, lengthens the session, or removes the internal-terms
 * route, this test fails before the change ships.
 *
 * To add another CUI tenant, copy this block with the new YAML path.
 */
describe('CUI deployment snapshots', () => {
	it('airmark.yaml composes the CUI policy', async () => {
		process.env.CONFIG_PATH = 'deployments/airmark.yaml';
		Object.assign(process.env, {
			AUTH_SECRET: 'x',
			AUTH_USAF_CLIENT_ID: 'x',
			AUTH_USAF_CLIENT_SECRET: 'x',
			DATABASE_URL: 'postgres://x',
			CRON_SECRET: 'x',
			FEEDBACK_GITLAB_KEY: 'x',
			FEEDBACK_GITLAB_URL: 'https://gitlab.example/api/v4/projects/1'
		});
		const cfg = getServerConfig();
		expect(cfg.classification.bannerTone).toBe('cui');
		expect(cfg.classification.showBanner).toBe(true);
		expect(cfg.classification.useInternalTerms).toBe(true);
		expect(cfg.classification.sessionMaxAgeSeconds).toBeLessThanOrEqual(3600);
		expect(cfg.classification.label).not.toBe('UNCLASSIFIED');
	});
});

describe('deep-freeze of cached config', () => {
	it('freezes nested branches so runtime mutation throws in strict mode', () => {
		process.env.CONFIG_PATH = writeYaml(MINIMAL_YAML);
		const cfg = getServerConfig();
		expect(Object.isFrozen(cfg)).toBe(true);
		expect(Object.isFrozen(cfg.auth)).toBe(true);
		expect(Object.isFrozen(cfg.auth.providers)).toBe(true);
		expect(Object.isFrozen(cfg.classification)).toBe(true);
		expect(Object.isFrozen(cfg.brand)).toBe(true);
		expect(Object.isFrozen(cfg.brand.meta)).toBe(true);
		expect(Object.isFrozen(cfg.brand.urls)).toBe(true);
		expect(Object.isFrozen(cfg.features)).toBe(true);
		expect(Object.isFrozen(cfg.features.feedback)).toBe(true);
		expect(() => {
			(cfg.auth.providers as { github: boolean }).github = true;
		}).toThrow(TypeError);
	});
});

describe('reference deployment YAMLs', () => {
	it('all reference YAMLs in deployments/ parse', async () => {
		const { ConfigSchema } = await import('./schema');
		const { readFileSync } = await import('node:fs');
		const { parse } = await import('yaml');
		const files = readdirSync('deployments').filter((f) => f.endsWith('.yaml'));
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const raw = readFileSync(`deployments/${file}`, 'utf8');
			const result = ConfigSchema.safeParse(parse(raw));
			expect(result.success, `${file}: ${result.error?.message}`).toBe(true);
		}
	});
});

/**
 * Contract tests for toPublicConfig.
 *
 * The function signature `(cfg: Config) => PublicConfig` makes TypeScript
 * enforce that every PublicConfig key is projected. These tests guard the
 * other direction: future widening of PublicConfig (or careless refactors
 * to a spread-based projection) cannot accidentally expose server-only
 * fields like db.driver, auth.providers config, or feedback.upstream.
 */
describe('toPublicConfig — leak contract', () => {
	function buildFullConfig(): Config {
		return {
			brand: {
				prefix: 't',
				suffix: 'q',
				full: 'tq',
				displayFull: 'TQ',
				copyright: 'TQ',
				meta: {
					titleTemplate: '%s',
					defaultTitle: 'tq',
					description: 'd',
					keywords: 'k',
					ogSiteName: 'TQ',
					icons: {
						favicon: '/favicon.svg',
						logo: '/logo.svg',
						pwa192: '/pwa-192x192.png',
						pwa512: '/pwa-512x512.png'
					}
				},
				urls: {
					website: 'https://example.com',
					about: 'https://example.com/a',
					terms: 'https://example.com/t',
					privacy: 'https://example.com/p'
				}
			},
			classification: {
				label: 'U',
				showBanner: false,
				bannerTone: 'unclassified',
				useInternalTerms: false,
				sessionMaxAgeSeconds: 3600
			},
			auth: {
				guestMode: false,
				providers: {
					github: true,
					google: false,
					mock: false,
					oidc: {
						id: 'leaky-id',
						name: 'leaky-name',
						issuer: 'https://leaky-issuer.example.com',
						scopes: ['openid'],
						envPrefix: 'LEAKY_PREFIX'
					}
				}
			},
			features: {
				mobile: true,
				feedback: { upstream: 'gitlab' },
				cron: { enabled: true },
				mcp: { enabled: false }
			},
			db: { driver: 'pg' }
		};
	}

	it('does not expose the db branch', () => {
		const pub = toPublicConfig(buildFullConfig()) as Record<string, unknown>;
		expect(pub.db).toBeUndefined();
	});

	it('exposes only auth.guestMode (not providers config)', () => {
		const pub = toPublicConfig(buildFullConfig());
		expect(Object.keys(pub.auth)).toEqual(['guestMode']);
	});

	it('exposes feedback as enabled-only (not upstream/keys)', () => {
		const pub = toPublicConfig(buildFullConfig());
		expect(Object.keys(pub.features.feedback)).toEqual(['enabled']);
		expect(pub.features.feedback.enabled).toBe(true);
	});

	it('reduces feedback.enabled to false when upstream is none', () => {
		const cfg = buildFullConfig();
		cfg.features.feedback.upstream = 'none';
		expect(toPublicConfig(cfg).features.feedback.enabled).toBe(false);
	});

	it('does not include any string identifiable as a server-only marker', () => {
		const json = JSON.stringify(toPublicConfig(buildFullConfig()));
		expect(json).not.toMatch(/leaky-issuer/);
		expect(json).not.toMatch(/LEAKY_PREFIX/);
		expect(json).not.toMatch(/"upstream"/);
		expect(json).not.toMatch(/"driver"/);
	});

	it('passes the full brand and classification shape through', () => {
		const pub = toPublicConfig(buildFullConfig());
		expect(Object.keys(pub.brand).sort()).toEqual(
			['copyright', 'displayFull', 'full', 'meta', 'prefix', 'suffix', 'urls'].sort()
		);
		expect(Object.keys(pub.brand.meta.icons).sort()).toEqual(
			['favicon', 'logo', 'pwa192', 'pwa512'].sort()
		);
		expect(Object.keys(pub.classification).sort()).toEqual(
			['bannerTone', 'label', 'sessionMaxAgeSeconds', 'showBanner', 'useInternalTerms'].sort()
		);
	});
});
