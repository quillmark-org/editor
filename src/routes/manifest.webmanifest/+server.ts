import type { RequestHandler } from './$types';
import { getServerConfig } from '$lib/config/load.server';

const BROWSER_CACHE_SECONDS = 86400; // 1 day
const CDN_CACHE_SECONDS = 2592000; // 30 days
const STALE_WHILE_REVALIDATE_SECONDS = 604800; // 7 days
const STALE_IF_ERROR_SECONDS = 2592000; // 30 days

export const GET: RequestHandler = async () => {
	const { brand } = getServerConfig();
	return new Response(
		JSON.stringify({
			name: brand.displayFull,
			short_name: brand.meta.ogSiteName,
			description: brand.meta.description,
			start_url: '/',
			scope: '/',
			display: 'standalone',
			background_color: '#09090B',
			theme_color: '#09090B',
			icons: [
				{
					src: brand.meta.icons.pwa192,
					sizes: '192x192',
					type: 'image/png',
					purpose: 'any'
				},
				{
					src: brand.meta.icons.pwa512,
					sizes: '512x512',
					type: 'image/png',
					purpose: 'any maskable'
				}
			]
		}),
		{
			headers: {
				'content-type': 'application/manifest+json',
				'cache-control': `public, max-age=${BROWSER_CACHE_SECONDS}, s-maxage=${CDN_CACHE_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}, stale-if-error=${STALE_IF_ERROR_SECONDS}`
			}
		}
	);
};
