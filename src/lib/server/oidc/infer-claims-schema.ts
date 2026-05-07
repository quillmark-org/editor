/**
 * Build a JSON-serializable shape of OIDC claim *types* (no claim values).
 * Arrays use the first element as representative; empty arrays are ['empty'].
 */
export function inferOidcClaimsSchema(value: unknown): unknown {
	if (value === null || value === undefined) {
		return 'null';
	}
	const t = typeof value;
	if (t === 'string') return 'string';
	if (t === 'number') return 'number';
	if (t === 'boolean') return 'boolean';
	if (t === 'bigint') return 'bigint';
	if (t === 'symbol' || t === 'function') return 'unknown';
	if (Array.isArray(value)) {
		if (value.length === 0) {
			return ['empty'];
		}
		return [inferOidcClaimsSchema(value[0])];
	}
	if (t === 'object') {
		const o = value as Record<string, unknown>;
		const result: Record<string, unknown> = {};
		for (const key of Object.keys(o).sort()) {
			result[key] = inferOidcClaimsSchema(o[key]);
		}
		return result;
	}
	return 'unknown';
}
