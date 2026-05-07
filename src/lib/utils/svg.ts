const DEFAULT_DIMENSIONS = { width: 612, height: 792 };

/**
 * Extract width and height from an SVG's viewBox attribute.
 * Returns US Letter dimensions as fallback if viewBox is missing or invalid.
 */
export function extractSvgDimensions(svg: string): { width: number; height: number } {
	const viewBoxMatch = svg.match(/viewBox=["']([^"']+)["']/);
	if (!viewBoxMatch) return DEFAULT_DIMENSIONS;
	const parts = viewBoxMatch[1].split(/[\s,]+/).map(Number);
	if (parts.length !== 4 || parts.some(isNaN)) return DEFAULT_DIMENSIONS;
	return { width: parts[2], height: parts[3] };
}

/**
 * Wrap raw SVG markup in a minimal HTML document suitable for iframe srcdoc.
 */
export function buildSvgSrcdoc(svg: string): string {
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>* { margin: 0; padding: 0; box-sizing: border-box; } html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; } svg { display: block; width: 100%; height: 100%; }</style></head><body>${svg}</body></html>`;
}
