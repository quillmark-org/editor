import type { RenderResult } from '$lib/types.js';

/** Build a single Blob from the first artifact in a render result. */
export function resultToBlob(result: RenderResult): Blob {
	const artifact = result.artifacts[0];
	if (!artifact) {
		throw new Error('Invalid render result: no artifacts');
	}
	return new Blob([artifact.bytes as BlobPart], { type: artifact.mimeType });
}

/** Decode each SVG artifact's bytes to a string. */
export function resultToSVGPages(result: RenderResult): string[] {
	if (result.outputFormat !== 'svg') {
		throw new Error('RenderResult is not SVG format');
	}
	const artifacts = result.artifacts;
	if (!Array.isArray(artifacts) || artifacts.length === 0) {
		throw new Error('Invalid render result: artifacts is empty');
	}
	const decoder = new TextDecoder('utf-8');
	return artifacts.map((a) => decoder.decode(a.bytes));
}
