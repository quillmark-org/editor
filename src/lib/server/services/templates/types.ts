/**
 * Template Library Service Types
 * Server-side types for the template library feature.
 */

import { createErrorClass } from '$lib/errors';
import type { Document } from '$lib/services/documents/types';

export type UUID = string;

/** Template list item (no content, for browse view) */
export interface TemplateListItem {
	id: UUID;
	title: string;
	owner_display_name: string;
	is_official: boolean;
	star_count: number;
	import_count: number;
	quill_ref: string | null;
	content_hash: string | null;
	created_at: string;
	updated_at: string;
}

/** Full template detail (with content) */
export interface TemplateDetail extends TemplateListItem {
	description: string;
	content: string;
	content_hash: string | null;
	is_starred: boolean;
}

/** Paginated template list result */
export interface TemplateListResult {
	templates: TemplateListItem[];
	total: number;
	limit: number;
	offset: number;
}

/** Parameters for listing/searching templates */
export interface ListTemplatesParams {
	q?: string;
	quillRef?: string[];
	official?: boolean;
	sort?: 'recommended' | 'stars' | 'imports' | 'recent' | 'alpha';
	limit?: number;
	offset?: number;
}

export interface ListRecentTemplatesParams {
	q?: string;
	limit?: number;
}

export interface RecentTemplateListResult {
	templates: TemplateListItem[];
	total: number;
}

/** Parameters for creating a template */
export interface CreateTemplateParams {
	document_id: UUID;
	title: string;
	description: string;
}

/** Parameters for updating template metadata */
export interface UpdateTemplateMetadataParams {
	title?: string;
	description?: string;
}

/** Error codes for template operations */
export type TemplateLibraryErrorCode =
	| 'not_found'
	| 'unauthorized'
	| 'validation_error'
	| 'already_starred'
	| 'not_starred'
	| 'unknown_error';

export const TemplateLibraryError =
	createErrorClass<TemplateLibraryErrorCode>('TemplateLibraryError');

/** Template service contract */
export interface TemplateLibraryServiceContract {
	listTemplates(params: ListTemplatesParams): Promise<TemplateListResult>;
	getTemplate(id: UUID, userId?: UUID | null): Promise<TemplateDetail>;
	createTemplate(userId: UUID, params: CreateTemplateParams): Promise<TemplateDetail>;
	updateTemplateMetadata(
		userId: UUID,
		templateId: UUID,
		params: UpdateTemplateMetadataParams
	): Promise<TemplateDetail>;
	updateTemplateContent(userId: UUID, templateId: UUID): Promise<TemplateDetail>;
	unpublishTemplate(userId: UUID, templateId: UUID): Promise<void>;
	getStarredTemplateIds(userId: UUID): Promise<UUID[]>;
	starTemplate(userId: UUID, templateId: UUID): Promise<{ star_count: number }>;
	unstarTemplate(userId: UUID, templateId: UUID): Promise<{ star_count: number }>;
	importTemplate(userId: UUID, templateId: UUID, name?: string): Promise<Document>;
	listRecentTemplates(
		userId: UUID,
		params?: ListRecentTemplatesParams
	): Promise<RecentTemplateListResult>;
	getTemplateByDocumentId(documentId: UUID, userId?: UUID | null): Promise<TemplateDetail>;
	resetTemplateToPublished(userId: UUID, templateId: UUID): Promise<void>;
}
