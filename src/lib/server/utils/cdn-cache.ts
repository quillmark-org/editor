/**
 * CDN Cache Utilities
 *
 * Provides cache-control headers and ETag helpers for template content
 * endpoints.  On Vercel, `CDN-Cache-Control` governs the edge cache
 * independently of the browser (`Cache-Control` stays private for
 * authenticated data).
 *
 * The primary goal is shielding the database from repeated fetches of
 * template *content* (the heavy payload).  Metadata-only list queries
 * are cheap and remain uncached.
 *
 * Invalidation is handled naturally by TTL expiration + ETag revalidation.
 * When the edge TTL expires it revalidates with origin; the origin checks
 * content_hash via ETag and returns 304 if nothing changed — keeping the
 * DB read cheap (just the hash, no full content transfer).
 */

// ---------------------------------------------------------------------------
// Cache profile for template content
// ---------------------------------------------------------------------------

export interface CacheProfile {
	/** Browser cache max-age in seconds (keep short or zero for dynamic data) */
	browserMaxAge: number;
	/** CDN / edge cache max-age in seconds */
	cdnMaxAge: number;
	/** How long the edge may serve stale while revalidating (seconds) */
	staleWhileRevalidate: number;
}

/**
 * Template detail (includes full content).  Cached at the edge because
 * content changes are infrequent; TTL + stale-while-revalidate handles
 * eventual freshness without manual purging.
 */
export const CACHE_TEMPLATE_DETAIL: CacheProfile = {
	browserMaxAge: 0,
	cdnMaxAge: 300, // 5 minutes
	staleWhileRevalidate: 600 // 10 minutes
};

// ---------------------------------------------------------------------------
// Header helpers
// ---------------------------------------------------------------------------

/**
 * Apply CDN cache headers to a Response.
 *
 * - `Cache-Control` tells the browser not to cache (or cache briefly).
 * - `CDN-Cache-Control` (Vercel-specific) tells the edge to cache the
 *   response and serve stale-while-revalidate.
 */
export function applyCdnCacheHeaders(response: Response, profile: CacheProfile): Response {
	// Browser: don't cache (the client may have just starred/imported)
	if (profile.browserMaxAge > 0) {
		response.headers.set('Cache-Control', `public, max-age=${profile.browserMaxAge}`);
	} else {
		response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
	}

	// Edge: cache with stale-while-revalidate
	response.headers.set(
		'CDN-Cache-Control',
		`public, max-age=${profile.cdnMaxAge}, stale-while-revalidate=${profile.staleWhileRevalidate}`
	);

	return response;
}

// ---------------------------------------------------------------------------
// ETag helpers (powered by content_hash)
// ---------------------------------------------------------------------------

/**
 * Generate a weak ETag from the template's content_hash.
 * Falls back to updatedAt when content_hash is not yet populated.
 */
export function makeETag(contentHash: string | null, updatedAt: string): string {
	const raw = contentHash ?? updatedAt;
	return `W/"${raw}"`;
}

/**
 * Check If-None-Match against a computed ETag.
 * Returns a 304 Response if matched, otherwise null.
 */
export function checkETag(request: Request, etag: string): Response | null {
	const ifNoneMatch = request.headers.get('If-None-Match');
	if (ifNoneMatch && ifNoneMatch === etag) {
		return new Response(null, { status: 304, headers: { ETag: etag } });
	}
	return null;
}
