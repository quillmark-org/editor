// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { Session } from '@auth/sveltekit';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			auth(): Promise<Session | null>;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

declare module '@auth/core/jwt' {
	interface JWT {
		id?: string;
		verifiedAt?: number;
	}
}

export {};
