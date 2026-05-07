/**
 * Auth.js Configuration
 * SvelteKit Auth with GitHub and Google OAuth and Drizzle adapter.
 * Provider toggles come from deployment YAML; secrets come from env.
 * Uses JWT sessions (no database session table).
 */

import { SvelteKitAuth } from '@auth/sveltekit';
import GitHub from '@auth/sveltekit/providers/github';
import Google from '@auth/sveltekit/providers/google';
import type { OIDCConfig } from '@auth/sveltekit/providers';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import Credentials from '@auth/sveltekit/providers/credentials';
import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { MOCK_USER } from './auth-env';
import { getDb, schema } from '$lib/server/db';
import { getServerConfig } from '$lib/config/load.server';
import type { OidcProviderConfig } from '$lib/config/schema';
import { runNewUserSetup } from '$lib/server/services/user/first-login-actions';
import { recordActivity } from '$lib/server/services/metrics';
import { inferOidcClaimsSchema } from '$lib/server/oidc/infer-claims-schema';

// Unique per process — changes on every server restart.
// Used to rotate cookie prefix for in-memory pglite so stale JWTs auto-invalidate.
const pgliteNonce = randomUUID().substring(0, 8);

/** Log OIDC claim *schema* (types only) once per server process on first OIDC sign-in. */
let oidcClaimsSchemaLogged = false;

// Cache the JWT user-existence DB check on the token; re-check at most once
// per interval. Bounds the staleness window for deleted users while removing
// the per-request DB hit.
const JWT_VERIFY_INTERVAL_MS = 5 * 60 * 1000;

// AUTH_SECRET is asserted by the boot cascade whenever any non-mock provider
// is enabled, so the fallback only applies to mock-only deployments.
function getAuthSecret(): string {
	return env.AUTH_SECRET ?? 'mock-auth-secret-for-development-only';
}

export { MOCK_USER };

/**
 * Build a generic OIDC provider from the YAML config.
 * Supports any standard OIDC IdP (Keycloak, Okta, Auth0, Authentik, etc.).
 * Secrets are read from env vars derived from the configured envPrefix —
 * e.g. envPrefix: AUTH_USAF → AUTH_USAF_CLIENT_ID, AUTH_USAF_CLIENT_SECRET.
 */
function createOidcProvider(cfg: OidcProviderConfig): OIDCConfig<Record<string, unknown>> {
	// Read via process.env (not $env/dynamic/private) because the var name is
	// computed from envPrefix; SvelteKit's typed env proxy doesn't support
	// dynamic key lookups.
	const clientId = process.env[`${cfg.envPrefix}_CLIENT_ID`];
	const clientSecret = process.env[`${cfg.envPrefix}_CLIENT_SECRET`];
	return {
		id: cfg.id,
		name: cfg.name,
		type: 'oidc',
		issuer: cfg.issuer,
		clientId,
		clientSecret,
		checks: ['pkce', 'state'],
		authorization: {
			params: {
				scope: cfg.scopes.join(' ')
			}
		},
		profile(profile) {
			if (!oidcClaimsSchemaLogged) {
				oidcClaimsSchemaLogged = true;
				try {
					console.log(
						`[AUTH] OIDC (${cfg.id}) ID token claims schema:`,
						JSON.stringify(inferOidcClaimsSchema(profile))
					);
				} catch {
					console.log(`[AUTH] OIDC (${cfg.id}) ID token claims schema: [could not serialize]`);
				}
			}
			const pickString = (v: unknown) => (typeof v === 'string' ? v : undefined);
			return {
				id: pickString(profile.sub),
				email: pickString(profile.email),
				name: pickString(profile.name) ?? pickString(profile.preferred_username),
				image: pickString(profile.picture)
			};
		}
	};
}

function getProviders() {
	const { providers: toggles } = getServerConfig().auth;
	const providers = [];

	if (toggles.mock) {
		providers.push(
			Credentials({
				id: 'credentials',
				name: 'Mock Login',
				credentials: {
					username: { label: 'Username', type: 'text' }
				},
				async authorize() {
					// Auth.js Credentials provider skips adapter.createUser,
					// so we must ensure the mock user exists in the database ourselves.
					// Without this, all DB operations fail with foreign key violations.
					const db = await getDb();
					const [inserted] = await db
						.insert(schema.users)
						.values(MOCK_USER)
						.onConflictDoNothing({ target: schema.users.id })
						.returning();

					if (inserted) {
						try {
							await runNewUserSetup(MOCK_USER.id);
						} catch (error) {
							console.error('Failed to run mock user setup:', error);
						}
					}

					return MOCK_USER;
				}
			})
		);
	}

	if (toggles.github) providers.push(GitHub);
	if (toggles.google) providers.push(Google);
	if (toggles.oidc !== null) providers.push(createOidcProvider(toggles.oidc));

	return providers;
}

// Build the provider list once at module load. The SvelteKitAuth factory below
// runs per request, so closing over a precomputed array avoids re-instantiating
// the OIDC provider on every request.
const providers = getProviders();
console.log(
	'[AUTH] Configured providers:',
	providers
		.map((p) => (typeof p === 'function' ? p.name : p.name || p.id) || 'unknown')
		.join(', ') || 'none'
);

export const { handle, signIn, signOut } = SvelteKitAuth(async () => {
	const db = await getDb();

	// Create base adapter
	const baseAdapter = DrizzleAdapter(db, {
		usersTable: schema.users,
		accountsTable: schema.accounts
	});

	// Override getUserByEmail to prevent email-based account linking
	// This ensures each OAuth provider creates an independent account
	const adapter = {
		...baseAdapter,
		getUserByEmail: async () => null // Always return null to prevent email matching
	};

	/**
	 * Generate a unique cookie prefix based on the database configuration.
	 * This ensures that sessions are automatically isolated when switching databases
	 * (e.g. between local pglite and Neon), preventing "stale session" errors.
	 *
	 * For in-memory pglite, the prefix includes a per-process nonce so that
	 * server restarts automatically invalidate stale JWTs (the DB is gone anyway).
	 */
	function getAutoCookiePrefix(): string {
		if (env.AUTH_COOKIE_PREFIX) {
			return env.AUTH_COOKIE_PREFIX;
		}

		const driver = getServerConfig().db.driver;
		const isPgliteInMemory = driver === 'pglite' && !env.DATABASE_URL;

		// For in-memory DBs, include a process-scoped nonce so every restart
		// gets a fresh cookie namespace (data is lost anyway).
		const key = isPgliteInMemory
			? `pglite:memory:${pgliteNonce}`
			: `${driver}:${env.DATABASE_URL || 'memory'}`;

		// Use a short hash of the connection string
		// We use MD5 for speed/brevity, security is not a concern for the *name* of the cookie
		const hash = createHash('md5').update(key).digest('hex').substring(0, 8);

		return `auth-${hash}`;
	}

	const cookiePrefix = getAutoCookiePrefix();

	return {
		adapter,
		providers,
		secret: getAuthSecret(),
		trustHost: true,
		session: {
			strategy: 'jwt',
			maxAge: getServerConfig().classification.sessionMaxAgeSeconds
		},
		// Custom cookie names to prevent environment collision
		cookies: {
			sessionToken: {
				name: `${cookiePrefix}.session-token`,
				options: {
					httpOnly: true,
					sameSite: 'lax',
					path: '/',
					secure: process.env.NODE_ENV === 'production'
				}
			},
			callbackUrl: {
				name: `${cookiePrefix}.callback-url`,
				options: {
					sameSite: 'lax',
					path: '/',
					secure: process.env.NODE_ENV === 'production'
				}
			},
			csrfToken: {
				name: `${cookiePrefix}.csrf-token`,
				options: {
					httpOnly: false, // Allow client JS to read CSRF token for signIn() POST requests
					sameSite: 'lax',
					path: '/',
					secure: process.env.NODE_ENV === 'production'
				}
			}
		},
		pages: {
			signIn: '/signin'
		},
		callbacks: {
			/**
			 * signIn callback - runs when a user attempts to sign in
			 * For OIDC providers, syncs the full raw claims into users.profile JSONB
			 * so we preserve all provider data without needing dedicated columns.
			 */
			signIn: async ({ user, account, profile: oidcProfile }) => {
				const oidcId = getServerConfig().auth.providers.oidc?.id;
				if (oidcId && account?.provider === oidcId && oidcProfile && user?.id) {
					try {
						await db
							.update(schema.users)
							.set({
								profile: oidcProfile,
								updatedAt: new Date()
							})
							.where(eq(schema.users.id, user.id));
					} catch (error) {
						// Log but don't block sign-in — claims sync is best-effort
						console.error('[AUTH] Failed to sync OIDC claims to user profile:', error);
					}
				}
				return true;
			},

			/**
			 * JWT callback - runs on every request
			 * Adds user ID to the token
			 *
			 * The DB existence check guards against JWTs that outlive a deleted
			 * user row (e.g. after a local/dev DB reset). Running it on every
			 * request would amplify a single session token into a per-request
			 * DB roundtrip, so we cache freshness on the token via `verifiedAt`
			 * and only re-check after JWT_VERIFY_INTERVAL_MS.
			 */
			jwt: async ({ token, user }) => {
				if (user) {
					token.id = user.id;
					token.verifiedAt = Date.now();
					return token;
				}

				if (token.id) {
					const lastVerified = typeof token.verifiedAt === 'number' ? token.verifiedAt : 0;
					if (Date.now() - lastVerified < JWT_VERIFY_INTERVAL_MS) {
						return token;
					}

					const [existingUser] = await db
						.select({ id: schema.users.id })
						.from(schema.users)
						.where(eq(schema.users.id, token.id as string))
						.limit(1);

					if (!existingUser) {
						delete token.id;
						delete token.sub;
						delete token.name;
						delete token.email;
						delete token.picture;
						delete token.verifiedAt;
						return token;
					}

					token.verifiedAt = Date.now();
				}

				return token;
			},

			/**
			 * Session callback - runs when session is checked
			 * Adds user ID to session for client access
			 */
			session: async ({ session, token }) => {
				if (token.id && session.user) {
					session.user.id = token.id as string;
					// Fire-and-forget: record daily active user
					recordActivity(token.id as string);
				} else if (session.user) {
					// Keep session shape explicit when identity is invalidated.
					session.user.id = '';
				}
				return session;
			}
		},
		events: {
			/**
			 * createUser event - fires exactly once when a new user is created
			 * Runs one-time setup actions (e.g., create welcome document)
			 */
			createUser: async ({ user }) => {
				if (!user.id) {
					throw new Error('Auth.js createUser event did not include user.id');
				}
				await runNewUserSetup(user.id);
			}
		}
	};
});
