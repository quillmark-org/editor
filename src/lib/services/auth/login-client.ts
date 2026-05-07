/**
 * Login Client
 * Client-side service for authentication operations
 * Works with Auth.js for authentication
 */

import type { AuthProvider, AuthProviderConfig } from './types';

/**
 * Login Client
 * Provides methods for login/logout/session management
 */
export class LoginClient {
	// Stores the providers (set via SSR)
	private providers: AuthProviderConfig[] = [];
	private initialized = false;

	/**
	 * Initialize providers from SSR data
	 * This should be called from the root layout with data from +layout.server.ts
	 */
	initializeProviders(providers: AuthProviderConfig[]): void {
		this.providers = providers;
		this.initialized = true;
	}

	/**
	 * Get available authentication providers for UI display
	 * Must be initialized via SSR before calling this method
	 */
	async getProviders(): Promise<AuthProviderConfig[]> {
		if (!this.initialized) {
			throw new Error(
				'Auth providers not initialized. Call initializeProviders() with SSR data before getProviders().'
			);
		}

		return this.providers;
	}

	/**
	 * Initiate login via Auth.js
	 * Uses POST via signIn() client library (CSRF cookie is httpOnly: false)
	 */
	async initiateLogin(provider: AuthProvider, callbackUrl?: string): Promise<void> {
		const { signIn } = await import('@auth/sveltekit/client');
		const redirectUrl = callbackUrl || '/';

		if (provider === 'mock' || provider === 'credentials') {
			await signIn('credentials', {
				username: 'mock-user',
				callbackUrl: redirectUrl,
				redirect: true
			});
		} else {
			await signIn(provider, { callbackUrl: redirectUrl });
		}
	}

	/**
	 * Sign out - uses official client library
	 * Handles CSRF and redirect automatically
	 */
	async signOut(): Promise<void> {
		const { signOut } = await import('@auth/sveltekit/client');
		await signOut({ callbackUrl: window.location.origin });
	}
}

/**
 * Singleton instance for login client
 */
export const loginClient = new LoginClient();
