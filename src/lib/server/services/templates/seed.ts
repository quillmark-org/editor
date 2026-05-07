/**
 * Official Template Sync
 * Seeds the system user and syncs official templates from the static manifest.
 * Template UUIDs are derived deterministically from the manifest `id` via RFC 4122
 * UUID v5 with a project-specific namespace (no duplicate `uuid` in the manifest).
 *
 * Namespace UUID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
 * (project-specific; never change this or all template IDs will rotate)
 */

import { eq } from 'drizzle-orm';
import { v5 as uuidv5 } from 'uuid';
import { getDb, schema } from '$lib/server/db';
import { computeContentHash } from '$lib/server/utils/content-hash';
import { quillmarkServerService } from '$lib/server/services/quillmark/service';
import { loadTemplate, type ManifestEntry } from './loader';
import { SYSTEM_USER_ID } from './constants';
import { MOCK_USER } from '$lib/server/auth-env';
import { getServerConfig } from '$lib/config/load.server';

/**
 * Project-specific namespace for UUID v5 derivation of official template IDs.
 * NEVER change this value — doing so will rotate all official template UUIDs.
 */
const OFFICIAL_TEMPLATE_NAMESPACE = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

/**
 * Derive a stable UUID for an official template from its manifest string ID (RFC 4122 UUID v5).
 */
export function officialTemplateUUID(manifestId: string): string {
	return uuidv5(manifestId, OFFICIAL_TEMPLATE_NAMESPACE);
}

/**
 * Ensure the system user exists for official template ownership.
 */
async function seedSystemUser(): Promise<void> {
	const db = await getDb();

	const [existing] = await db
		.select({ id: schema.users.id })
		.from(schema.users)
		.where(eq(schema.users.id, SYSTEM_USER_ID));

	if (!existing) {
		await db.insert(schema.users).values({
			id: SYSTEM_USER_ID,
			email: 'system@tonguetoquill.app',
			name: 'Tongue to Quill',
			createdAt: new Date(),
			updatedAt: new Date()
		});
	}
}

/**
 * Ensure the mock dev user exists so sessions survive pglite restarts.
 * Only runs when auth.providers.mock is enabled.
 */
async function seedMockUser(): Promise<void> {
	if (!getServerConfig().auth.providers.mock) return;
	const db = await getDb();
	await db
		.insert(schema.users)
		.values({
			...MOCK_USER,
			createdAt: new Date(),
			updatedAt: new Date()
		})
		.onConflictDoNothing({ target: schema.users.id });
}

/**
 * Core sync logic: upserts templates from a manifest into the database.
 * Accepts an abstract content loader so it works with both filesystem and HTTP sources.
 */
export async function syncOfficialTemplatesFromData(
	manifest: ManifestEntry[],
	loadContent: (filename: string) => Promise<string>
): Promise<number> {
	await seedSystemUser();
	await seedMockUser();

	const db = await getDb();
	const activeTemplateIds = new Set<string>();

	for (const entry of manifest) {
		if (!entry.production) continue;

		let content: string;
		try {
			content = await loadContent(entry.file);
		} catch {
			console.warn(`[Templates] Failed to load ${entry.file}, skipping`);
			continue;
		}

		const contentHash = computeContentHash(content);

		let quillRef: string | null = null;
		try {
			const parsed = await quillmarkServerService.parseDocument(content);
			quillRef = parsed.quillRef;
		} catch {
			// quillRef remains null — non-fatal
		}

		const quillAvailable = quillRef !== null && (await quillmarkServerService.hasQuill(quillRef));
		const isPublished = quillAvailable;
		if (!isPublished) {
			console.warn(
				`[Templates] Unpublishing official template "${entry.id}": ${
					quillRef ? `Quill "${quillRef}" not provided by quiver` : 'no QUILL frontmatter'
				}`
			);
		}

		const templateId = officialTemplateUUID(entry.id);
		activeTemplateIds.add(templateId);

		// Upsert: insert or update based on content hash change
		await db
			.insert(schema.templates)
			.values({
				id: templateId,
				ownerId: SYSTEM_USER_ID,
				documentId: null,
				title: entry.name,
				description: entry.description,
				content,
				contentHash,
				quillRef,
				isPublished
			})
			.onConflictDoUpdate({
				target: schema.templates.id,
				set: {
					title: entry.name,
					description: entry.description,
					content,
					contentHash,
					quillRef,
					isPublished,
					updatedAt: new Date()
				}
			});
	}

	// Mark removed official templates as unpublished
	const allSystemTemplates = await db
		.select({ id: schema.templates.id })
		.from(schema.templates)
		.where(eq(schema.templates.ownerId, SYSTEM_USER_ID));

	for (const t of allSystemTemplates) {
		if (!activeTemplateIds.has(t.id)) {
			await db
				.update(schema.templates)
				.set({ isPublished: false, updatedAt: new Date() })
				.where(eq(schema.templates.id, t.id));
		}
	}

	console.log(`[Templates] Synced ${activeTemplateIds.size} official templates`);
	return activeTemplateIds.size;
}

/**
 * Sync official templates from the local filesystem (static/templates/).
 * Used by non-serverless deployments where static files are on disk.
 */
export async function syncOfficialTemplates(): Promise<void> {
	try {
		const fs = await import('fs');
		const path = await import('path');
		const manifestPath = path.resolve(process.cwd(), 'static', 'templates', 'templates.json');

		if (!fs.existsSync(manifestPath)) {
			console.warn('[Templates] Manifest not found, skipping official template sync');
			return;
		}

		const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
		await syncOfficialTemplatesFromData(manifest, loadTemplate);
	} catch (error) {
		console.error('[Templates] Failed to sync official templates:', error);
	}
}
