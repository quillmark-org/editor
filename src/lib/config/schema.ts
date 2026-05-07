import { z } from 'zod';

/**
 * In Zod 4, a parent `.default({})` replaces a missing object with the
 * literal `{}` and skips leaf defaults inside it. `withParentDefault` uses
 * `z.preprocess` to substitute `{}` for `undefined` before validation, so
 * the schema's own leaf `.default(...)` calls fire — keeping leaf defaults
 * as the single source of truth.
 */
function withParentDefault<S extends z.ZodTypeAny>(schema: S) {
	return z.preprocess((v) => v ?? {}, schema);
}

/**
 * Asset paths default to shared static files. Tenants override per-asset
 * by dropping their own files in static/ and pointing here.
 */
const IconsSchema = withParentDefault(
	z
		.object({
			favicon: z.string().default('/favicon.svg'),
			logo: z.string().default('/logo.svg'),
			pwa192: z.string().default('/pwa-192x192.png'),
			pwa512: z.string().default('/pwa-512x512.png')
		})
		.strict()
);

/**
 * Brand identity is inherently per-tenant — no defaults at the brand level.
 * A new consumer fork must declare its own brand, urls, and copyright.
 *
 * `.strict()` rejects unknown keys so that operator typos (e.g. `favicon` at
 * `meta.favicon` instead of `meta.icons.favicon`) fail at boot rather than
 * silently dropping the override.
 */
const BrandSchema = z
	.object({
		prefix: z.string(),
		suffix: z.string(),
		full: z.string(),
		displayFull: z.string(),
		copyright: z.string(),
		meta: z
			.object({
				titleTemplate: z.string(),
				defaultTitle: z.string(),
				description: z.string(),
				keywords: z.string(),
				ogSiteName: z.string(),
				icons: IconsSchema
			})
			.strict(),
		urls: z
			.object({
				website: z.string().url(),
				about: z.string().url(),
				terms: z.string().url(),
				privacy: z.string().url()
			})
			.strict()
	})
	.strict();

/**
 * Generic primitives. The schema is intentionally agnostic about classification
 * regimes: a deployment composes these fields directly in YAML. The one place
 * the schema does constrain is `bannerTone` — marking colors carry semantic
 * meaning (e.g. CUI guidance specifies the purple banner), so the visual tone
 * is a fixed enum rather than free-form color input.
 */
const ClassificationSchema = withParentDefault(
	z
		.object({
			label: z.string().default('UNCLASSIFIED'),
			showBanner: z.boolean().default(false),
			bannerTone: z.enum(['unclassified', 'cui']).default('unclassified'),
			useInternalTerms: z.boolean().default(false),
			sessionMaxAgeSeconds: z
				.number()
				.int()
				.positive()
				.default(7 * 24 * 60 * 60)
		})
		.strict()
);

const ProviderEnabled = z.boolean().default(false);

/**
 * Generic OIDC provider slot. One per deployment (most tenants have a
 * single SSO IdP). Set to null to disable. Backwards compat with the
 * previous airmark.yaml is via envPrefix: existing tenants set
 * `envPrefix: AUTH_USAF` to keep their existing CLIENT_ID/CLIENT_SECRET
 * env var names. New tenants get the default `AUTH_OIDC` prefix.
 *
 * The cascade requires `${envPrefix}_CLIENT_ID` and `${envPrefix}_CLIENT_SECRET`
 * when this slot is non-null. The regex on `envPrefix` keeps it to a
 * conventional env-var-name shape so the cascade entries are always
 * legitimate environment-variable lookups.
 */
const OidcSchema = z
	.object({
		id: z.string().min(1),
		name: z.string().min(1),
		issuer: z.string().url(),
		scopes: z.array(z.string()).default(['openid', 'email', 'profile']),
		envPrefix: z
			.string()
			.regex(/^[A-Z][A-Z0-9_]*$/, {
				message: 'envPrefix must match /^[A-Z][A-Z0-9_]*$/ (uppercase env-var name shape)'
			})
			.default('AUTH_OIDC')
	})
	.strict()
	.nullable()
	.default(null);

const AuthSchema = z
	.object({
		guestMode: z.boolean(),
		providers: withParentDefault(
			z
				.object({
					github: ProviderEnabled,
					google: ProviderEnabled,
					mock: ProviderEnabled,
					oidc: OidcSchema
				})
				.strict()
		)
	})
	.strict()
	.refine(
		(auth) => {
			if (auth.guestMode) return true;
			return (
				auth.providers.github ||
				auth.providers.google ||
				auth.providers.mock ||
				auth.providers.oidc !== null
			);
		},
		{
			message: 'guestMode=false requires at least one auth provider to be enabled',
			path: ['providers']
		}
	);

const FeedbackSchema = withParentDefault(
	z
		.object({
			upstream: z.enum(['github', 'gitlab', 'none']).default('none')
		})
		.strict()
);

const CronSchema = withParentDefault(
	z
		.object({
			enabled: z.boolean().default(false)
		})
		.strict()
);

const McpSchema = withParentDefault(
	z
		.object({
			enabled: z.boolean().default(false)
		})
		.strict()
);

const FeaturesSchema = withParentDefault(
	z
		.object({
			mobile: z.boolean().default(true),
			feedback: FeedbackSchema,
			cron: CronSchema,
			mcp: McpSchema
		})
		.strict()
);

const DbSchema = z
	.object({
		driver: z.enum(['pglite', 'pg', 'neon'])
	})
	.strict();

export const ConfigSchema = z
	.object({
		brand: BrandSchema,
		classification: ClassificationSchema,
		auth: AuthSchema,
		features: FeaturesSchema,
		db: DbSchema
	})
	.strict()
	.refine((cfg) => !cfg.features.mcp.enabled || cfg.features.cron.enabled, {
		message:
			'features.mcp.enabled requires features.cron.enabled — expired ephemeral documents are deleted by the cron sweep, and leaving them past their TTL violates the ephemeral privacy contract',
		path: ['features', 'mcp']
	});

export type Config = z.infer<typeof ConfigSchema>;
export type Brand = z.infer<typeof BrandSchema>;
export type Classification = z.infer<typeof ClassificationSchema>;
export type OidcProviderConfig = NonNullable<z.infer<typeof OidcSchema>>;

/**
 * The subset of Config shipped to the browser via page.data.config (`$app/state`).
 *
 * This shape is declared independently of `Brand`/`Classification` on purpose:
 * widening `BrandSchema` or `ClassificationSchema` with a server-only field
 * (e.g. an admin email or signing key) must NOT silently extend what reaches
 * the client. Adding a field to `PublicConfig` here, and to the projection
 * in `toPublicConfig` below, is a deliberate, reviewable step.
 */
export type PublicConfig = {
	brand: {
		prefix: string;
		suffix: string;
		full: string;
		displayFull: string;
		copyright: string;
		meta: {
			titleTemplate: string;
			defaultTitle: string;
			description: string;
			keywords: string;
			ogSiteName: string;
			icons: {
				favicon: string;
				logo: string;
				pwa192: string;
				pwa512: string;
			};
		};
		urls: {
			website: string;
			about: string;
			terms: string;
			privacy: string;
		};
	};
	classification: {
		label: string;
		showBanner: boolean;
		bannerTone: 'unclassified' | 'cui';
		useInternalTerms: boolean;
		sessionMaxAgeSeconds: number;
	};
	auth: { guestMode: boolean };
	features: {
		mobile: boolean;
		feedback: { enabled: boolean };
	};
};

/**
 * Cache the projection per Config identity. The loader returns a single frozen
 * Config for the lifetime of the process, so SSR layout loads (which call this
 * on every request) reuse one PublicConfig object — keeping `page.data.config`
 * reference-stable for downstream `$derived` reads.
 */
const publicConfigCache = new WeakMap<Config, PublicConfig>();

export function toPublicConfig(cfg: Config): PublicConfig {
	const cached = publicConfigCache.get(cfg);
	if (cached) return cached;
	const { brand, classification } = cfg;
	const projected: PublicConfig = {
		brand: {
			prefix: brand.prefix,
			suffix: brand.suffix,
			full: brand.full,
			displayFull: brand.displayFull,
			copyright: brand.copyright,
			meta: {
				titleTemplate: brand.meta.titleTemplate,
				defaultTitle: brand.meta.defaultTitle,
				description: brand.meta.description,
				keywords: brand.meta.keywords,
				ogSiteName: brand.meta.ogSiteName,
				icons: {
					favicon: brand.meta.icons.favicon,
					logo: brand.meta.icons.logo,
					pwa192: brand.meta.icons.pwa192,
					pwa512: brand.meta.icons.pwa512
				}
			},
			urls: {
				website: brand.urls.website,
				about: brand.urls.about,
				terms: brand.urls.terms,
				privacy: brand.urls.privacy
			}
		},
		classification: {
			label: classification.label,
			showBanner: classification.showBanner,
			bannerTone: classification.bannerTone,
			useInternalTerms: classification.useInternalTerms,
			sessionMaxAgeSeconds: classification.sessionMaxAgeSeconds
		},
		auth: { guestMode: cfg.auth.guestMode },
		features: {
			mobile: cfg.features.mobile,
			feedback: { enabled: cfg.features.feedback.upstream !== 'none' }
		}
	};
	publicConfigCache.set(cfg, projected);
	return projected;
}

/**
 * Toggle → required env vars registry.
 *
 * Single source of truth for the validation cascade. Every behavioral toggle
 * that requires secrets declares them here; the loader walks this list at
 * boot and fails with a complete list of anything missing. Adding a new
 * provider/feature: add a schema field above, add an entry here.
 */
export type SecretRequirement = {
	description: string;
	when: (cfg: Config) => boolean;
	vars: (cfg: Config) => ReadonlyArray<string>;
};

export const SECRET_REQUIREMENTS: ReadonlyArray<SecretRequirement> = [
	{
		description: 'GitHub OAuth provider',
		when: (c) => c.auth.providers.github,
		vars: () => ['AUTH_GITHUB_ID', 'AUTH_GITHUB_SECRET']
	},
	{
		description: 'Google OAuth provider',
		when: (c) => c.auth.providers.google,
		vars: () => ['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET']
	},
	{
		description: 'OIDC provider (env vars derived from envPrefix)',
		when: (c) => c.auth.providers.oidc !== null,
		vars: (c) => {
			const prefix = c.auth.providers.oidc?.envPrefix ?? 'AUTH_OIDC';
			return [`${prefix}_CLIENT_ID`, `${prefix}_CLIENT_SECRET`];
		}
	},
	{
		description: 'JWT signing for non-mock auth',
		when: (c) =>
			c.auth.providers.github || c.auth.providers.google || c.auth.providers.oidc !== null,
		vars: () => ['AUTH_SECRET']
	},
	{
		description: 'GitHub feedback upstream',
		when: (c) => c.features.feedback.upstream === 'github',
		vars: () => ['FEEDBACK_GITHUB_KEY']
	},
	{
		description: 'GitLab feedback upstream',
		when: (c) => c.features.feedback.upstream === 'gitlab',
		vars: () => ['FEEDBACK_GITLAB_KEY', 'FEEDBACK_GITLAB_URL']
	},
	{
		description: 'Persistent database connection',
		when: (c) => c.db.driver === 'pg' || c.db.driver === 'neon',
		vars: () => ['DATABASE_URL']
	},
	{
		description: 'Cron endpoint authentication',
		when: (c) => c.features.cron.enabled,
		vars: () => ['CRON_SECRET']
	}
];
