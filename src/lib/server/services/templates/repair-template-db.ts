import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getDb } from '../../db';
import {
	runClientDocumentRepairs,
	type ClientDocumentRepairId
} from '../../../parsing/document-repairs';
import * as schema from '../../db/schema';
import { computeContentHash } from '../../utils/content-hash';
import { DocumentValidator } from '$lib/services/documents/document-validator';
import { quillmarkServerService } from '$lib/server/services/quillmark/service';

/** Drizzle instance shape used by template repairs (self-hosted `pg` driver). */
export type RepairTemplateDb = NodePgDatabase<typeof schema>;

export interface RepairTemplateParams {
	templateId: string;
	repairIds?: readonly ClientDocumentRepairId[];
	dryRun?: boolean;
	now?: Date;
}

export interface RepairTemplateResult {
	templateId: string;
	documentId: string | null;
	dryRun: boolean;
	found: boolean;
	applied: readonly ClientDocumentRepairId[];
	changed: boolean;
	updatedTemplate: boolean;
	updatedDocument: boolean;
}

export async function repairTemplateWithDb(
	db: RepairTemplateDb,
	params: RepairTemplateParams
): Promise<RepairTemplateResult> {
	const { templateId, repairIds = [], dryRun = false, now = new Date() } = params;

	const [template] = await db
		.select({
			id: schema.templates.id,
			documentId: schema.templates.documentId,
			content: schema.templates.content
		})
		.from(schema.templates)
		.where(and(eq(schema.templates.id, templateId), eq(schema.templates.isPublished, true)));

	if (!template) {
		return {
			templateId,
			documentId: null,
			dryRun,
			found: false,
			applied: [],
			changed: false,
			updatedTemplate: false,
			updatedDocument: false
		};
	}

	const datePaths = await quillmarkServerService.getDatePathConfigForMarkdown(template.content);
	const { Document } = await import('@quillmark/wasm');
	const repaired = runClientDocumentRepairs(template.content, Document, {
		now,
		include: repairIds,
		datePaths: datePaths ?? undefined
	});

	const changed = repaired.document !== template.content;
	const result: RepairTemplateResult = {
		templateId: template.id,
		documentId: template.documentId,
		dryRun,
		found: true,
		applied: repaired.applied,
		changed,
		updatedTemplate: false,
		updatedDocument: false
	};

	if (!changed || dryRun) return result;

	const contentHash = computeContentHash(repaired.document);
	const contentSizeBytes = DocumentValidator.getByteLength(repaired.document);
	const updatedAt = new Date();

	await db
		.update(schema.templates)
		.set({ content: repaired.document, contentHash, updatedAt })
		.where(eq(schema.templates.id, template.id));
	result.updatedTemplate = true;

	if (template.documentId) {
		await db
			.update(schema.documents)
			.set({ content: repaired.document, contentHash, contentSizeBytes, updatedAt })
			.where(eq(schema.documents.id, template.documentId));
		result.updatedDocument = true;
	}

	return result;
}

export async function repairTemplateWithAppDb(
	params: RepairTemplateParams
): Promise<RepairTemplateResult> {
	const db = await getDb();
	return repairTemplateWithDb(db as RepairTemplateDb, params);
}
