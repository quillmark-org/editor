/**
 * Authentication Providers Server Service
 * Single source of truth for available authentication providers.
 * Toggles come from deployment YAML (auth.providers.*); secrets come from env.
 */

import { getServerConfig } from '$lib/config/load.server';
import type { AuthProviderConfig } from '$lib/services/auth/types';

export function getAuthProviders(): AuthProviderConfig[] {
	const { providers } = getServerConfig().auth;
	const out: AuthProviderConfig[] = [];

	if (providers.mock) {
		out.push({
			id: 'credentials',
			type: 'credentials',
			name: 'Mock Login'
		});
	}

	if (providers.github) {
		out.push({
			id: 'github',
			type: 'oauth',
			name: 'GitHub',
			preferredVariant: 'default'
		});
	}

	if (providers.google) {
		out.push({
			id: 'google',
			type: 'oauth',
			name: 'Google',
			preferredVariant: 'outline'
		});
	}

	if (providers.oidc !== null) {
		out.push({
			id: providers.oidc.id,
			type: 'oidc',
			name: providers.oidc.name,
			preferredVariant: 'outline'
		});
	}

	return out;
}
