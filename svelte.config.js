import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: process.env.VERCEL
			? (await import('@sveltejs/adapter-vercel')).default()
			: (await import('@sveltejs/adapter-node')).default(),
		csrf: {
			trustedOrigins: process.env.NODE_ENV === 'development' ? ['*'] : []
		}
	},
	onwarn: (warning, handler) => {
		// Suppress the CSS unused selector warning.
		if (warning.code === 'css_unused_selector') {
			return;
		}
		// Let the default handler process other warnings.
		handler(warning);
	}
};

export default config;
