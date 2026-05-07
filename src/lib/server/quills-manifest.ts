/**
 * Load the packaged Quiver manifest from `static/quills/`.
 *
 * `Quiver.build()` writes `Quiver.json` (a stable bootstrap pointer) and a
 * content-addressed `manifest.<hash>.json` listing every packaged quill. SSR
 * embeds the manifest at build time so the layout load avoids extra HTTP
 * round-trips and works on Vercel (where `static/` is not on disk inside
 * `/var/task`).
 */

import type { QuillManifest, QuillMetadata } from '$lib/services/quillmark/types';
import bootstrapPointer from '../../../static/quills/Quiver.json';

interface BuiltQuiverManifestEntry {
	name: string;
	version: string;
	bundle: string;
	fonts: Record<string, string>;
}

interface BuiltQuiverManifest {
	version: number;
	name: string;
	quills: BuiltQuiverManifestEntry[];
}

const manifestModules = import.meta.glob('../../../static/quills/manifest.*.json', {
	eager: true,
	import: 'default'
}) as Record<string, BuiltQuiverManifest>;

function resolveManifestFileName(): string {
	const pointer = bootstrapPointer as { manifest?: unknown };
	if (typeof pointer.manifest !== 'string' || pointer.manifest.trim() === '') {
		throw new Error('Quiver bootstrap pointer (Quiver.json) missing `manifest` filename');
	}
	return pointer.manifest.trim();
}

/** Available quills (name, version, optional description) for SSR layout. */
export function loadQuillManifestFromStatic(): QuillManifest {
	const manifestFileName = resolveManifestFileName();
	const match = Object.entries(manifestModules).find(([p]) => p.endsWith(manifestFileName));
	if (!match) {
		throw new Error(
			`Quiver manifest "${manifestFileName}" not found in server bundle. Run \`npm run pack:quills\` and rebuild. Bundled: ${Object.keys(manifestModules).join(', ')}`
		);
	}
	const built = match[1];
	const quills: QuillMetadata[] = built.quills.map((q) => ({
		name: q.name,
		version: q.version
	}));
	return { quills };
}
