import type { LayoutServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { getAuthProviders } from '$lib/server/services/auth/auth-providers';
import { getServerConfig } from '$lib/config/load.server';
import { toPublicConfig } from '$lib/config/schema';
import templateManifest from '../../static/templates/templates.json';
import { loadQuillManifestFromStatic } from '$lib/server/quills-manifest';

export const load: LayoutServerLoad = async (event) => {
	const session = await event.locals.auth();

	const quillManifest = loadQuillManifestFromStatic();

	let safeSession = session;
	if (session?.user) {
		const { email: _email, ...userWithoutEmail } = session.user;
		void _email;
		safeSession = { ...session, user: userWithoutEmail };
	}

	return {
		session: safeSession,
		providers: getAuthProviders(),
		isVercel: !!env.VERCEL,
		templateManifest: templateManifest,
		quillManifest: quillManifest.quills,
		config: toPublicConfig(getServerConfig())
	};
};
