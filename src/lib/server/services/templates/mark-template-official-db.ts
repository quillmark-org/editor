import { and, eq, ne } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getDb, schema } from '$lib/server/db';
import { SYSTEM_USER_ID } from './constants';

/**
 * Drizzle instance shape this module operates against. `getDb()` returns a
 * union of pglite/neon/pg drivers; narrowing here lets TypeScript resolve the
 * `.returning(fields)` overload (otherwise the union collapses to the no-arg
 * variant and `.returning({...})` is rejected as "Expected 0 arguments").
 */
type AppDb = NodePgDatabase<typeof schema>;

export type MarkTemplateOfficialStatus =
	| 'marked_official'
	| 'already_official'
	| 'not_published'
	| 'not_found'
	| 'no_change';

export interface MarkTemplateOfficialByIdResult {
	templateId: string;
	status: MarkTemplateOfficialStatus;
	changed: boolean;
}

/**
 * Promote a user-published template to official ownership.
 * A template is considered "official" when `owner_id = SYSTEM_USER_ID`.
 */
export async function markTemplateOfficialByIdWithAppDb(
	templateId: string
): Promise<MarkTemplateOfficialByIdResult> {
	const db = (await getDb()) as AppDb;
	const [row] = await db
		.select({
			id: schema.templates.id,
			ownerId: schema.templates.ownerId,
			isPublished: schema.templates.isPublished
		})
		.from(schema.templates)
		.where(eq(schema.templates.id, templateId))
		.limit(1);

	if (!row) {
		return { templateId, status: 'not_found', changed: false };
	}
	if (row.ownerId === SYSTEM_USER_ID) {
		return { templateId, status: 'already_official', changed: false };
	}
	if (!row.isPublished) {
		return { templateId, status: 'not_published', changed: false };
	}

	const updated = await db
		.update(schema.templates)
		.set({
			ownerId: SYSTEM_USER_ID,
			updatedAt: new Date()
		})
		.where(
			and(
				eq(schema.templates.id, templateId),
				ne(schema.templates.ownerId, SYSTEM_USER_ID),
				eq(schema.templates.isPublished, true)
			)
		)
		.returning({ id: schema.templates.id });

	if (updated.length === 0) {
		return { templateId, status: 'no_change', changed: false };
	}

	return { templateId, status: 'marked_official', changed: true };
}
