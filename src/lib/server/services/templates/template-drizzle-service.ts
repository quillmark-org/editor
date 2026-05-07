/**
 * Drizzle Template Library Service
 * Implements TemplateLibraryServiceContract using Drizzle ORM.
 */

import { eq, and, desc, asc, sql, or, inArray, ne } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db';
import { mapDrizzleError } from '$lib/server/db/errors';
import { rethrowUnless, AppError } from '$lib/errors';
import { computeContentHash } from '$lib/server/utils/content-hash';
import { quillmarkServerService } from '$lib/server/services/quillmark/service';
import {
	SYSTEM_USER_ID,
	TEMPLATE_TITLE_MAX_LENGTH,
	TEMPLATE_DESCRIPTION_MAX_LENGTH
} from './constants';
import { DocumentValidator } from '$lib/services/documents/document-validator';
import type { Document } from '$lib/services/documents/types';
import {
	TemplateLibraryError,
	type TemplateLibraryServiceContract,
	type TemplateListItem,
	type TemplateDetail,
	type TemplateListResult,
	type ListTemplatesParams,
	type ListRecentTemplatesParams,
	type RecentTemplateListResult,
	type CreateTemplateParams,
	type UpdateTemplateMetadataParams,
	type UUID
} from './types';

type TemplateLibraryDb = Awaited<ReturnType<typeof getDb>>;
type TemplateLibraryTx = Parameters<Parameters<TemplateLibraryDb['transaction']>[0]>[0];

const SQL_ILIKE_ESCAPE = '\\';

/**
 * Escapes SQL LIKE/ILIKE metacharacters in user input so `%` and `_`
 * are treated as literals, and `\` remains a literal escape character.
 * This prevents wildcard/pattern injection in text search while preserving
 * Drizzle parameterization protections against SQL injection.
 */
function escapeLikePattern(input: string): string {
	return input.replace(/[\\%_]/g, (char) => `${SQL_ILIKE_ESCAPE}${char}`);
}

function mapToListItem(row: {
	id: string;
	title: string;
	ownerId: string;
	ownerName: string | null;
	starCount: number;
	importCount: number;
	quillRef: string | null;
	contentHash: string | null;
	createdAt: Date;
	updatedAt: Date;
}): TemplateListItem {
	return {
		id: row.id,
		title: row.title,
		owner_display_name: row.ownerId === SYSTEM_USER_ID ? 'Official' : row.ownerName || 'Anonymous',
		is_official: row.ownerId === SYSTEM_USER_ID,
		star_count: row.starCount,
		import_count: row.importCount,
		quill_ref: row.quillRef,
		content_hash: row.contentHash,
		created_at: row.createdAt.toISOString(),
		updated_at: row.updatedAt.toISOString()
	};
}

export class DrizzleTemplateLibraryService implements TemplateLibraryServiceContract {
	/**
	 * Shared star mutation: insert star row, bump cached starCount only when the row is new.
	 * If already starred, returns fallbackStarCount (caller supplies the template's current count).
	 */
	private async applyStarInsert(
		tx: TemplateLibraryTx,
		userId: UUID,
		templateId: UUID,
		fallbackStarCount: number
	): Promise<{ star_count: number }> {
		const inserted = await tx
			.insert(schema.templateStars)
			.values({ templateId, userId })
			.onConflictDoNothing()
			.returning();

		if (inserted.length > 0) {
			const [updated] = await tx
				.update(schema.templates)
				.set({ starCount: sql`${schema.templates.starCount} + 1` })
				.where(eq(schema.templates.id, templateId))
				.returning();
			return { star_count: updated.starCount };
		}

		return { star_count: fallbackStarCount };
	}
	async listTemplates(params: ListTemplatesParams): Promise<TemplateListResult> {
		const { q, quillRef, official, sort = 'recommended', limit = 25, offset = 0 } = params;
		const validatedLimit = Math.min(Math.max(limit, 1), 100);

		try {
			const db = await getDb();

			// Build where conditions
			const conditions = [eq(schema.templates.isPublished, true)];

			if (q) {
				const escapedSearch = escapeLikePattern(q);
				conditions.push(
					or(
						sql`${schema.templates.title} ILIKE ${`%${escapedSearch}%`} ESCAPE ${SQL_ILIKE_ESCAPE}`,
						sql`${schema.templates.description} ILIKE ${`%${escapedSearch}%`} ESCAPE ${SQL_ILIKE_ESCAPE}`,
						sql`${schema.users.name} ILIKE ${`%${escapedSearch}%`} ESCAPE ${SQL_ILIKE_ESCAPE}`
					)!
				);
			}
			if (official === true) {
				conditions.push(eq(schema.templates.ownerId, SYSTEM_USER_ID));
			} else if (official === false) {
				conditions.push(ne(schema.templates.ownerId, SYSTEM_USER_ID));
			}
			if (quillRef && quillRef.length > 0) {
				conditions.push(inArray(schema.templates.quillRef, quillRef));
			}

			const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

			// Sort order
			let orderBy;
			switch (sort) {
				case 'stars':
					orderBy = desc(schema.templates.starCount);
					break;
				case 'imports':
					orderBy = desc(schema.templates.importCount);
					break;
				case 'recent':
					orderBy = desc(schema.templates.createdAt);
					break;
				case 'alpha':
					orderBy = asc(schema.templates.title);
					break;
				case 'recommended':
				default:
					// Blended score: official first, then ln(stars+1) + ln(imports+1) + recency
					orderBy = [
						asc(sql`CASE WHEN ${schema.templates.ownerId} = ${SYSTEM_USER_ID} THEN 0 ELSE 1 END`),
						desc(
							sql`ln(${schema.templates.starCount} + 1) + ln(${schema.templates.importCount} + 1) + EXTRACT(EPOCH FROM ${schema.templates.createdAt}) / 86400 / 365`
						)
					];
					break;
			}

			const orderByArr = Array.isArray(orderBy) ? orderBy : [orderBy];

			const rows = await db
				.select({
					id: schema.templates.id,
					title: schema.templates.title,
					ownerId: schema.templates.ownerId,
					ownerName: schema.users.name,
					starCount: schema.templates.starCount,
					importCount: schema.templates.importCount,
					quillRef: schema.templates.quillRef,
					contentHash: schema.templates.contentHash,
					createdAt: schema.templates.createdAt,
					updatedAt: schema.templates.updatedAt,
					total: sql<number>`COUNT(*) OVER()`.mapWith(Number)
				})
				.from(schema.templates)
				.innerJoin(schema.users, eq(schema.templates.ownerId, schema.users.id))
				.where(whereClause)
				.orderBy(...orderByArr)
				.limit(validatedLimit)
				.offset(offset);

			const total = rows.length > 0 ? rows[0].total : 0;

			return {
				templates: rows.map(mapToListItem),
				total,
				limit: validatedLimit,
				offset
			};
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	async getTemplate(id: UUID, userId?: UUID | null): Promise<TemplateDetail> {
		try {
			const db = await getDb();

			const [row] = await db
				.select({
					id: schema.templates.id,
					title: schema.templates.title,
					description: schema.templates.description,
					content: schema.templates.content,
					contentHash: schema.templates.contentHash,
					ownerId: schema.templates.ownerId,
					ownerName: schema.users.name,
					starCount: schema.templates.starCount,
					importCount: schema.templates.importCount,
					quillRef: schema.templates.quillRef,
					createdAt: schema.templates.createdAt,
					updatedAt: schema.templates.updatedAt
				})
				.from(schema.templates)
				.innerJoin(schema.users, eq(schema.templates.ownerId, schema.users.id))
				.where(and(eq(schema.templates.id, id), eq(schema.templates.isPublished, true)));

			if (!row) {
				throw new TemplateLibraryError('not_found', 'Template not found', 404);
			}

			// Check if starred
			let isStarred = false;
			if (userId) {
				const [star] = await db
					.select({ templateId: schema.templateStars.templateId })
					.from(schema.templateStars)
					.where(
						and(eq(schema.templateStars.templateId, id), eq(schema.templateStars.userId, userId))
					);
				isStarred = !!star;
			}

			return {
				...mapToListItem(row),
				description: row.description,
				content: row.content,
				content_hash: row.contentHash,
				is_starred: isStarred
			};
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	async getTemplateByDocumentId(documentId: UUID, userId?: UUID | null): Promise<TemplateDetail> {
		try {
			const db = await getDb();

			const conditions = [
				eq(schema.templates.documentId, documentId),
				eq(schema.templates.isPublished, true)
			];
			if (!userId) {
				throw new TemplateLibraryError(
					'unauthorized',
					'Authentication required to access templates by document ID',
					401
				);
			}
			conditions.push(eq(schema.templates.ownerId, userId));

			const [row] = await db
				.select({ id: schema.templates.id, starCount: schema.templates.starCount })
				.from(schema.templates)
				.where(and(...conditions));

			if (!row) {
				throw new TemplateLibraryError('not_found', 'Template not found for document', 404);
			}

			return this.getTemplate(row.id, userId);
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	async createTemplate(userId: UUID, params: CreateTemplateParams): Promise<TemplateDetail> {
		const { document_id, title, description } = params;

		if (!title?.trim()) {
			throw new TemplateLibraryError('validation_error', 'Title is required', 400);
		}
		if (!description?.trim()) {
			throw new TemplateLibraryError('validation_error', 'Description is required', 400);
		}
		if (title.length > TEMPLATE_TITLE_MAX_LENGTH) {
			throw new TemplateLibraryError(
				'validation_error',
				`Title must be ${TEMPLATE_TITLE_MAX_LENGTH} characters or fewer`,
				400
			);
		}
		if (description.length > TEMPLATE_DESCRIPTION_MAX_LENGTH) {
			throw new TemplateLibraryError(
				'validation_error',
				`Description must be ${TEMPLATE_DESCRIPTION_MAX_LENGTH} characters or fewer`,
				400
			);
		}

		try {
			const db = await getDb();

			// Verify document ownership and get content
			const [doc] = await db
				.select()
				.from(schema.documents)
				.where(and(eq(schema.documents.id, document_id), eq(schema.documents.ownerId, userId)));

			if (!doc) {
				throw new TemplateLibraryError('not_found', 'Document not found or not owned by you', 404);
			}

			// Snapshot content
			const content = doc.content;
			const contentHash = computeContentHash(content);

			// Derive quill_ref
			let quillRef: string | null = null;
			try {
				const parsed = await quillmarkServerService.parseDocument(content);
				quillRef = parsed.quillRef;
			} catch {
				// quillRef remains null
			}

			const template = await db.transaction(async (tx) => {
				// Fork the document for template management
				const contentSizeBytes = DocumentValidator.getByteLength(content);
				const [forkDoc] = await tx
					.insert(schema.documents)
					.values({
						ownerId: userId,
						name: title,
						content,
						contentSizeBytes,
						contentHash
					})
					.returning();

				// Create template row
				const [createdTemplate] = await tx
					.insert(schema.templates)
					.values({
						ownerId: userId,
						documentId: forkDoc.id,
						title,
						description,
						content,
						contentHash,
						quillRef,
						isPublished: true,
						starCount: 0
					})
					.returning();

				// Auto-star newly published templates for the publishing user (same path as starTemplate).
				await this.applyStarInsert(tx, userId, createdTemplate.id, createdTemplate.starCount);

				return createdTemplate;
			});

			return this.getTemplate(template.id, userId);
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	async updateTemplateMetadata(
		userId: UUID,
		templateId: UUID,
		params: UpdateTemplateMetadataParams
	): Promise<TemplateDetail> {
		try {
			const db = await getDb();

			// Verify ownership
			const [template] = await db
				.select()
				.from(schema.templates)
				.where(
					and(
						eq(schema.templates.id, templateId),
						eq(schema.templates.ownerId, userId),
						eq(schema.templates.isPublished, true)
					)
				);

			if (!template) {
				throw new TemplateLibraryError('not_found', 'Template not found or not owned by you', 404);
			}

			const updates: Record<string, unknown> = { updatedAt: new Date() };
			if (params.title !== undefined) {
				if (!params.title.trim()) {
					throw new TemplateLibraryError('validation_error', 'Title is required', 400);
				}
				if (params.title.length > TEMPLATE_TITLE_MAX_LENGTH) {
					throw new TemplateLibraryError(
						'validation_error',
						`Title must be ${TEMPLATE_TITLE_MAX_LENGTH} characters or fewer`,
						400
					);
				}
				updates.title = params.title;
			}
			if (params.description !== undefined) {
				if (!params.description.trim()) {
					throw new TemplateLibraryError('validation_error', 'Description is required', 400);
				}
				if (params.description.length > TEMPLATE_DESCRIPTION_MAX_LENGTH) {
					throw new TemplateLibraryError(
						'validation_error',
						`Description must be ${TEMPLATE_DESCRIPTION_MAX_LENGTH} characters or fewer`,
						400
					);
				}
				updates.description = params.description;
			}

			await db.update(schema.templates).set(updates).where(eq(schema.templates.id, templateId));

			return this.getTemplate(templateId, userId);
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	async updateTemplateContent(userId: UUID, templateId: UUID): Promise<TemplateDetail> {
		try {
			const db = await getDb();

			// Verify ownership and get linked document
			const [template] = await db
				.select()
				.from(schema.templates)
				.where(
					and(
						eq(schema.templates.id, templateId),
						eq(schema.templates.ownerId, userId),
						eq(schema.templates.isPublished, true)
					)
				);

			if (!template) {
				throw new TemplateLibraryError('not_found', 'Template not found or not owned by you', 404);
			}

			if (!template.documentId) {
				throw new TemplateLibraryError('validation_error', 'Template has no linked document', 400);
			}

			// Read fork document content
			const [doc] = await db
				.select()
				.from(schema.documents)
				.where(
					and(eq(schema.documents.id, template.documentId), eq(schema.documents.ownerId, userId))
				);

			if (!doc) {
				throw new TemplateLibraryError('not_found', 'Linked document not found', 404);
			}

			const content = doc.content;
			const contentHash = computeContentHash(content);

			let quillRef: string | null = null;
			try {
				const parsed = await quillmarkServerService.parseDocument(content);
				quillRef = parsed.quillRef;
			} catch {
				// quillRef remains null
			}

			await db
				.update(schema.templates)
				.set({
					content,
					contentHash,
					quillRef,
					updatedAt: new Date()
				})
				.where(eq(schema.templates.id, templateId));

			return this.getTemplate(templateId, userId);
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	async unpublishTemplate(userId: UUID, templateId: UUID): Promise<void> {
		try {
			const db = await getDb();

			await db.transaction(async (tx) => {
				const [template] = await tx
					.select()
					.from(schema.templates)
					.where(
						and(
							eq(schema.templates.id, templateId),
							eq(schema.templates.ownerId, userId),
							eq(schema.templates.isPublished, true)
						)
					);

				if (!template) {
					throw new TemplateLibraryError(
						'not_found',
						'Template not found or not owned by you',
						404
					);
				}

				// Set unpublished
				await tx
					.update(schema.templates)
					.set({ isPublished: false, updatedAt: new Date() })
					.where(eq(schema.templates.id, templateId));

				// Delete the forked document
				if (template.documentId) {
					await tx
						.delete(schema.documents)
						.where(
							and(
								eq(schema.documents.id, template.documentId),
								eq(schema.documents.ownerId, userId)
							)
						);
				}
			});
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	async resetTemplateToPublished(userId: UUID, templateId: UUID): Promise<void> {
		try {
			const db = await getDb();

			// Verify ownership and get template content/documentId
			const [template] = await db
				.select()
				.from(schema.templates)
				.where(
					and(
						eq(schema.templates.id, templateId),
						eq(schema.templates.ownerId, userId),
						eq(schema.templates.isPublished, true)
					)
				);

			if (!template) {
				throw new TemplateLibraryError('not_found', 'Template not found or not owned by you', 404);
			}

			if (!template.documentId) {
				throw new TemplateLibraryError('validation_error', 'Template has no linked document', 400);
			}

			// Update the linked document's content with the template's snapshot
			const contentSizeBytes = DocumentValidator.getByteLength(template.content);

			await db
				.update(schema.documents)
				.set({
					content: template.content,
					contentHash: template.contentHash,
					contentSizeBytes,
					updatedAt: new Date()
				})
				.where(eq(schema.documents.id, template.documentId));
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	async getStarredTemplateIds(userId: UUID): Promise<UUID[]> {
		try {
			const db = await getDb();
			const rows = await db
				.select({ templateId: schema.templateStars.templateId })
				.from(schema.templateStars)
				.where(eq(schema.templateStars.userId, userId));
			return rows.map((r) => r.templateId);
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	async starTemplate(userId: UUID, templateId: UUID): Promise<{ star_count: number }> {
		try {
			const db = await getDb();
			return db.transaction(async (tx) => {
				// Verify template exists and is published
				const [template] = await tx
					.select({ id: schema.templates.id, starCount: schema.templates.starCount })
					.from(schema.templates)
					.where(and(eq(schema.templates.id, templateId), eq(schema.templates.isPublished, true)));

				if (!template) {
					throw new TemplateLibraryError('not_found', 'Template not found', 404);
				}

				return this.applyStarInsert(tx, userId, templateId, template.starCount);
			});
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	async unstarTemplate(userId: UUID, templateId: UUID): Promise<{ star_count: number }> {
		try {
			const db = await getDb();
			return db.transaction(async (tx) => {
				const result = await tx
					.delete(schema.templateStars)
					.where(
						and(
							eq(schema.templateStars.templateId, templateId),
							eq(schema.templateStars.userId, userId)
						)
					)
					.returning();

				if (result.length === 0) {
					throw new TemplateLibraryError('not_starred', 'Template was not starred', 400);
				}

				const [updated] = await tx
					.update(schema.templates)
					.set({
						starCount: sql`GREATEST(${schema.templates.starCount} - 1, 0)`
					})
					.where(eq(schema.templates.id, templateId))
					.returning();

				return { star_count: updated.starCount };
			});
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	async importTemplate(userId: UUID, templateId: UUID, name?: string): Promise<Document> {
		try {
			const db = await getDb();
			return db.transaction(async (tx) => {
				const [template] = await tx
					.select({
						id: schema.templates.id,
						title: schema.templates.title,
						content: schema.templates.content
					})
					.from(schema.templates)
					.where(and(eq(schema.templates.id, templateId), eq(schema.templates.isPublished, true)));

				if (!template) {
					throw new TemplateLibraryError('not_found', 'Template not found', 404);
				}

				const docName = name ?? template.title;
				DocumentValidator.validateName(docName);

				const content = template.content;
				const contentSizeBytes = DocumentValidator.getByteLength(content);
				const contentHash = computeContentHash(content);

				const [doc] = await tx
					.insert(schema.documents)
					.values({
						ownerId: userId,
						name: docName,
						content,
						contentSizeBytes,
						contentHash
					})
					.returning();

				await tx.insert(schema.templateImportEvents).values({
					templateId,
					userId,
					documentId: doc.id
				});

				await tx
					.insert(schema.templateUserRecents)
					.values({ userId, templateId, lastImportedAt: new Date() })
					.onConflictDoUpdate({
						target: [schema.templateUserRecents.userId, schema.templateUserRecents.templateId],
						set: { lastImportedAt: new Date() }
					});

				await tx
					.update(schema.templates)
					.set({ importCount: sql`${schema.templates.importCount} + 1` })
					.where(eq(schema.templates.id, templateId));

				return {
					id: doc.id,
					owner_id: doc.ownerId,
					name: doc.name,
					content: doc.content,
					content_size_bytes: doc.contentSizeBytes,
					is_public: doc.isPublic,
					content_hash: doc.contentHash ?? null,
					created_at: doc.createdAt.toISOString(),
					updated_at: doc.updatedAt.toISOString()
				};
			});
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}

	async listRecentTemplates(
		userId: UUID,
		params: ListRecentTemplatesParams = {}
	): Promise<RecentTemplateListResult> {
		try {
			const db = await getDb();
			const { q, limit = 8 } = params;
			const validatedLimit = Math.min(Math.max(limit, 1), 50);
			const conditions = [
				eq(schema.templateUserRecents.userId, userId),
				eq(schema.templates.isPublished, true)
			];
			if (q) {
				const escapedSearch = escapeLikePattern(q);
				conditions.push(
					or(
						sql`${schema.templates.title} ILIKE ${`%${escapedSearch}%`} ESCAPE ${SQL_ILIKE_ESCAPE}`,
						sql`${schema.templates.description} ILIKE ${`%${escapedSearch}%`} ESCAPE ${SQL_ILIKE_ESCAPE}`
					)!
				);
			}

			const rows = await db
				.select({
					templateId: schema.templates.id,
					title: schema.templates.title,
					ownerId: schema.templates.ownerId,
					ownerName: schema.users.name,
					starCount: schema.templates.starCount,
					importCount: schema.templates.importCount,
					quillRef: schema.templates.quillRef,
					contentHash: schema.templates.contentHash,
					createdAt: schema.templates.createdAt,
					updatedAt: schema.templates.updatedAt
				})
				.from(schema.templateUserRecents)
				.innerJoin(schema.templates, eq(schema.templateUserRecents.templateId, schema.templates.id))
				.innerJoin(schema.users, eq(schema.templates.ownerId, schema.users.id))
				.where(and(...conditions))
				.orderBy(desc(schema.templateUserRecents.lastImportedAt))
				.limit(validatedLimit);

			const templates = rows.map((row) =>
				mapToListItem({
					id: row.templateId,
					title: row.title,
					ownerId: row.ownerId,
					ownerName: row.ownerName,
					starCount: row.starCount,
					importCount: row.importCount,
					quillRef: row.quillRef,
					contentHash: row.contentHash,
					createdAt: row.createdAt,
					updatedAt: row.updatedAt
				})
			);

			const [countResult] = await db
				.select({ total: sql<number>`count(*)` })
				.from(schema.templateUserRecents)
				.innerJoin(schema.templates, eq(schema.templateUserRecents.templateId, schema.templates.id))
				.where(and(...conditions));

			return {
				templates,
				total: Number(countResult?.total ?? 0)
			};
		} catch (error) {
			rethrowUnless(error, AppError, mapDrizzleError);
		}
	}
}
