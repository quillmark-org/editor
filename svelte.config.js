import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			fallback: 'index.html'
		}),
		alias: {
			'@quillmark/editor': './src/lib'
		}
	},

	onwarn: (warning, handler) => {
		if (warning.code === 'css_unused_selector') return;
		handler(warning);
	}
};

export default config;
