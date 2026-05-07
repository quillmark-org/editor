import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	return new Response('Not found', {
		status: 404,
		headers: {
			'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
		}
	});
};
