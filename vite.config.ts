import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
	plugins: [wasm(), tailwindcss(), sveltekit()],
	worker: {
		// The thumbnail worker imports @quillmark/wasm; it needs the same wasm
		// plugin the main bundle uses or `?worker` build fails on the .wasm import.
		// `format: 'es'` is required because @quillmark/quiver uses dynamic
		// imports, which Rollup will code-split — incompatible with IIFE.
		format: 'es',
		plugins: () => [wasm()]
	},
	build: {
		rollupOptions: {
			// Externalize Vercel-specific packages if we're not on Vercel
			// to avoid build failures when devDependencies are omitted.
			// Also externalize @quillmark/quiver's Node-only dynamic-import
			// loaders so the browser bundle doesn't try to pull in
			// `node:fs/promises` / `node:path` etc. (Quiver.fromDir,
			// Quiver.build, and the testing harness are Node-only and never
			// reachable from the runtime code paths we ship to browsers.)
			external: (id) => {
				if (
					/@quillmark\/quiver\/dist\/(source-loader|build|assert-node|node|testing|transports\/fs-built-transport)\.js$/.test(
						id
					)
				) {
					return true;
				}
				const baseList = process.env.VERCEL
					? ['@sveltejs/adapter-node', '@sveltejs/adapter-auto']
					: [
							'@vercel/analytics',
							'@vercel/speed-insights',
							'@sveltejs/adapter-vercel',
							'@neondatabase/serverless'
						];
				return baseList.includes(id);
			}
		},
		chunkSizeWarningLimit: 1000
	},

	// Add WASM support
	optimizeDeps: {
		exclude: ['@quillmark/wasm']
	},

	server: {
		host: '127.0.0.1',
		port: 5173,
		allowedHosts: true,
		fs: {
			allow: ['./node_modules/@quillmark/wasm']
		}
	},

	preview: {
		port: 4173
	},

	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					environment: 'browser',
					browser: {
						enabled: true,
						provider: 'playwright',
						instances: [{ browser: 'chromium' }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
