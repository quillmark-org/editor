/**
 * Template Library API Client
 *
 * Client-side wrapper for the template library REST API.
 * Used by the NewDocumentModal to browse, search, star, and import templates.
 */

import { AppError } from '$lib/errors';
import { SessionExpiredError } from '$lib/errors/session-expired-error';
import { browser } from '$app/environment';
import type { Document } from '$lib/services/documents/types';

/** Template list item from GET /api/templates */
export interface LibraryTemplateListItem {
	id: string;
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

/** Full template detail from GET /api/templates/[id] */
export interface LibraryTemplateDetail extends LibraryTemplateListItem {
	description: string;
	content: string;
	content_hash: string | null;
	is_starred: boolean;
}

/** Paginated list result */
export interface LibraryTemplateListResult {
	templates: LibraryTemplateListItem[];
	total: number;
	limit: number;
	offset: number;
}

export interface LibraryRecentTemplateListResult {
	templates: LibraryTemplateListItem[];
	total: number;
}

/** Sort options for template list */
export type LibraryTemplateSortOption = 'recommended' | 'stars' | 'imports' | 'recent' | 'alpha';

/** Search/filter params */
export interface LibrarySearchParams {
	q?: string;
	quillRef?: string[];
	official?: boolean;
	sort?: LibraryTemplateSortOption;
	limit?: number;
	offset?: number;
}

export class TemplateApiError extends AppError {
	code: string;

	constructor(message: string, status: number, code: string) {
		super(code, message, status);
		this.name = 'TemplateApiError';
		this.code = code;
	}
}

function assertBrowserFetchContext(operation: string): void {
	if (browser) return;
	throw new TemplateApiError(
		`Template API "${operation}" must run in the browser (use onMount/load-triggered client flow).`,
		500,
		'ssr_fetch_forbidden'
	);
}

async function handleResponse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		if (response.status === 401) {
			throw new SessionExpiredError();
		}

		let message = `Request failed (${response.status})`;
		let code = 'request_failed';
		try {
			const body = await response.json();
			if (body?.message) message = body.message;
			if (body?.error) code = body.error;
		} catch {
			// ignore parse errors
		}
		throw new TemplateApiError(message, response.status, code);
	}
	return response.json();
}

/**
 * Browse the template library.
 */
export async function listLibraryTemplates(
	params: LibrarySearchParams = {}
): Promise<LibraryTemplateListResult> {
	assertBrowserFetchContext('listLibraryTemplates');
	const url = new URL('/api/templates', window.location.origin);
	if (params.q) url.searchParams.set('q', params.q);
	if (params.quillRef?.length) url.searchParams.set('quill_ref', params.quillRef.join(','));
	if (typeof params.official === 'boolean')
		url.searchParams.set('official', String(params.official));
	if (params.sort) url.searchParams.set('sort', params.sort);
	if (params.limit) url.searchParams.set('limit', String(params.limit));
	if (params.offset) url.searchParams.set('offset', String(params.offset));

	const response = await fetch(url.toString());
	return handleResponse<LibraryTemplateListResult>(response);
}

/**
 * Get full template detail including content (CDN-cached, no per-user data).
 * Star status should be resolved separately via getStarredTemplateIds().
 */
export async function getLibraryTemplate(id: string): Promise<LibraryTemplateDetail> {
	assertBrowserFetchContext('getLibraryTemplate');
	const response = await fetch(`/api/templates/${encodeURIComponent(id)}`);
	return handleResponse<LibraryTemplateDetail>(response);
}

/**
 * Fetch all template IDs the current user has starred.
 * Returns an empty array for unauthenticated users.
 */
export async function getStarredTemplateIds(): Promise<Set<string>> {
	if (!browser) return new Set();
	try {
		const response = await fetch('/api/templates/starred');
		const result = await handleResponse<{ ids: string[] }>(response);
		return new Set(result.ids);
	} catch {
		// Unauthenticated or any error — default to empty set
		return new Set();
	}
}

/**
 * Star a template. Returns updated star count.
 */
export async function starTemplate(id: string): Promise<{ star_count: number }> {
	assertBrowserFetchContext('starTemplate');
	const response = await fetch(`/api/templates/${encodeURIComponent(id)}/star`, {
		method: 'POST'
	});
	return handleResponse<{ star_count: number }>(response);
}

/**
 * Unstar a template. Returns updated star count.
 */
export async function unstarTemplate(id: string): Promise<{ star_count: number }> {
	assertBrowserFetchContext('unstarTemplate');
	const response = await fetch(`/api/templates/${encodeURIComponent(id)}/star`, {
		method: 'DELETE'
	});
	return handleResponse<{ star_count: number }>(response);
}

/**
 * Import a template as a new document. Content stays on the server; only an
 * optional `name` override travels up.
 */
export async function importTemplate(id: string, name?: string): Promise<Document> {
	assertBrowserFetchContext('importTemplate');
	const response = await fetch(`/api/templates/${encodeURIComponent(id)}/import`, {
		method: 'POST',
		headers: name !== undefined ? { 'Content-Type': 'application/json' } : undefined,
		body: name !== undefined ? JSON.stringify({ name }) : undefined
	});
	return handleResponse<Document>(response);
}

export interface CreateLibraryTemplateParams {
	document_id: string;
	title: string;
	description: string;
}

export interface UpdateLibraryTemplateMetadataParams {
	title?: string;
	description?: string;
}

/**
 * List recently used templates for the current authenticated user.
 */
export async function listRecentTemplates(
	params: {
		q?: string;
		limit?: number;
	} = {}
): Promise<LibraryRecentTemplateListResult> {
	assertBrowserFetchContext('listRecentTemplates');
	const url = new URL('/api/templates/recents', window.location.origin);
	if (params.q) url.searchParams.set('q', params.q);
	if (params.limit) url.searchParams.set('limit', String(params.limit));
	const response = await fetch(url.toString());
	return handleResponse<LibraryRecentTemplateListResult>(response);
}

/**
 * Publish a new template from a document.
 */
export async function publishTemplate(
	params: CreateLibraryTemplateParams
): Promise<LibraryTemplateDetail> {
	assertBrowserFetchContext('publishTemplate');
	const response = await fetch('/api/templates', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(params)
	});
	return handleResponse<LibraryTemplateDetail>(response);
}

/**
 * Update template metadata.
 */
export async function updateTemplateMetadata(
	id: string,
	params: UpdateLibraryTemplateMetadataParams
): Promise<LibraryTemplateDetail> {
	assertBrowserFetchContext('updateTemplateMetadata');
	const response = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(params)
	});
	return handleResponse<LibraryTemplateDetail>(response);
}

/**
 * Update template content snapshot.
 */
export async function updateTemplateContent(id: string): Promise<LibraryTemplateDetail> {
	assertBrowserFetchContext('updateTemplateContent');
	const response = await fetch(`/api/templates/${encodeURIComponent(id)}/content`, {
		method: 'PUT'
	});
	return handleResponse<LibraryTemplateDetail>(response);
}

/**
 * Unpublish a template.
 */
export async function unpublishTemplate(id: string): Promise<void> {
	assertBrowserFetchContext('unpublishTemplate');
	const response = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
		method: 'DELETE'
	});
	await handleResponse<{ success: boolean }>(response);
}

/**
 * Look up a template by its linked document ID.
 * Throws a 404 (handled by handleResponse) if not found.
 */
export async function getTemplateByDocumentId(documentId: string): Promise<LibraryTemplateDetail> {
	assertBrowserFetchContext('getTemplateByDocumentId');
	const response = await fetch(`/api/templates/by-document/${encodeURIComponent(documentId)}`);
	return handleResponse<LibraryTemplateDetail>(response);
}

/**
 * Reset a linked fork document to the published snapshot template content.
 */
export async function resetTemplateToPublished(id: string): Promise<void> {
	assertBrowserFetchContext('resetTemplateToPublished');
	const response = await fetch(`/api/templates/${encodeURIComponent(id)}/reset`, {
		method: 'PUT'
	});
	await handleResponse<{ success: boolean }>(response);
}
