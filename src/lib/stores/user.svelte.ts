/**
 * User Store
 * Reactive store for managing user authentication state using Svelte 5 Runes.
 * Replaces ad-hoc user state in components.
 */

import type { Session, User } from '$lib/services/auth/types';

class UserStore {
	private _session = $state<Session | null>(null);
	private _user = $state<User | null>(null);
	private _sessionExpired = $state(false);

	constructor() {
		// Initialize with null
	}

	/**
	 * Get the current session
	 */
	get session(): Session | null {
		return this._session;
	}

	/**
	 * Get the current user
	 */
	get user(): User | null {
		return this._user;
	}

	/**
	 * Check if user is authenticated
	 */
	get isAuthenticated(): boolean {
		return this._user !== null;
	}

	/**
	 * Get the current user ID
	 */
	get userId(): string | null {
		return this._user?.id ?? null;
	}

	/**
	 * Whether the session has expired (user was authenticated but session is no longer valid)
	 */
	get sessionExpired(): boolean {
		return this._sessionExpired;
	}

	/**
	 * Set the current session and derived user
	 * @param session - The Auth.js session object or null
	 */
	setSession(session: Session | null) {
		this._session = session;
		// Auth.js session user matches our User interface mostly,
		// but we ensure it's treated as our User type
		this._user = (session?.user as User) || null;
		if (session?.user) {
			this._sessionExpired = false;
		}
	}

	/**
	 * Clear user state (logout)
	 */
	clear() {
		this._session = null;
		this._user = null;
	}

	/**
	 * Mark the session as expired
	 * Sets the sessionExpired flag and clears user/session state
	 */
	markSessionExpired() {
		this._sessionExpired = true;
		this._session = null;
		this._user = null;
	}
}

// Export singleton instance
export const userStore = new UserStore();
