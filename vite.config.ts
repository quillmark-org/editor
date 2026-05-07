import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
	plugins: [wasm(), sveltekit()],

	worker: {
		format: 'es',
		plugins: () => [wasm()]
	},

	build: {
		rollupOptions: {
			external: (id) =>
				/@quillmark\/quiver\/dist\/(source-loader|build|assert-node|node|testing|transports\/fs-built-transport)\.js$/.test(
					id
				)
		}
	},

	optimizeDeps: {
		exclude: ['@quillmark/wasm']
	},

	server: {
		host: '127.0.0.1',
		port: 5173,
		fs: {
			allow: ['./node_modules/@quillmark/wasm']
		}
	},

	test: {
		environment: 'node',
		include: ['src/**/*.{test,spec}.{js,ts}'],
		// Tests that depend on DOM/CodeMirror are excluded by default; consumers
		// re-enable them via a per-test `// @vitest-environment jsdom` pragma.
		exclude: [
			'src/**/*.svelte.{test,spec}.{js,ts}',
			'src/lib/editor/codemirror/**/*.test.ts',
			'references/**'
		]
	}
});
