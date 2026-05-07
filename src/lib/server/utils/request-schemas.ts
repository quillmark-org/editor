import { errorResponse, isValidUUID } from '$lib/server/utils/api';
import { optionalStringField, requireStringField } from '$lib/server/utils/request-validation';
import {
	TEMPLATE_DESCRIPTION_MAX_LENGTH,
	TEMPLATE_TITLE_MAX_LENGTH
} from '$lib/server/services/templates/constants';

export interface CreateTemplateRequest {
	document_id: string;
	title: string;
	description: string;
}

export interface UpdateTemplateRequest {
	title?: string;
	description?: string;
}

export interface CreateDocumentRequest {
	name: string;
	content: string;
}

export interface UpdateDocumentRequest {
	content?: string;
	name?: string;
	is_public?: boolean;
}

export function parseCreateTemplateRequest(body: unknown): CreateTemplateRequest | Response {
	const payload = toObject(body);
	if (payload instanceof Response) return payload;

	const validatedDocumentId = requireStringField(
		payload.document_id,
		'document_id',
		'document_id is required'
	);
	if (validatedDocumentId instanceof Response) return validatedDocumentId;
	if (!isValidUUID(validatedDocumentId)) {
		return errorResponse('validation_error', 'document_id must be a valid UUID', 400);
	}

	const validatedTitle = requireStringField(
		payload.title,
		'title',
		'title is required',
		TEMPLATE_TITLE_MAX_LENGTH
	);
	if (validatedTitle instanceof Response) return validatedTitle;

	const validatedDescription = requireStringField(
		payload.description,
		'description',
		'description is required',
		TEMPLATE_DESCRIPTION_MAX_LENGTH
	);
	if (validatedDescription instanceof Response) return validatedDescription;

	return {
		document_id: validatedDocumentId,
		title: validatedTitle,
		description: validatedDescription
	};
}

export function parseUpdateTemplateRequest(body: unknown): UpdateTemplateRequest | Response {
	const payload = toObject(body);
	if (payload instanceof Response) return payload;

	const validatedTitle = optionalStringField(
		payload.title,
		'title',
		'title must be a non-empty string',
		TEMPLATE_TITLE_MAX_LENGTH
	);
	if (validatedTitle instanceof Response) return validatedTitle;

	const validatedDescription = optionalStringField(
		payload.description,
		'description',
		'description must be a non-empty string',
		TEMPLATE_DESCRIPTION_MAX_LENGTH
	);
	if (validatedDescription instanceof Response) return validatedDescription;

	return {
		title: validatedTitle,
		description: validatedDescription
	};
}

export function parseCreateDocumentRequest(body: unknown): CreateDocumentRequest | Response {
	const payload = toObject(body);
	if (payload instanceof Response) return payload;

	const validatedName = requireStringField(
		payload.name,
		'name',
		'Document name is required and must be a string'
	);
	if (validatedName instanceof Response) return validatedName;

	if (payload.content !== undefined && typeof payload.content !== 'string') {
		return errorResponse('validation_error', 'content must be a string', 400);
	}

	return {
		name: validatedName,
		content: payload.content || ''
	};
}

export function parseUpdateDocumentRequest(body: unknown): UpdateDocumentRequest | Response {
	const payload = toObject(body);
	if (payload instanceof Response) return payload;

	const { content, name, is_public } = payload;

	if (content === undefined && name === undefined && is_public === undefined) {
		return errorResponse(
			'validation_error',
			'At least one of content, name, or is_public must be provided',
			400
		);
	}

	if (content !== undefined && typeof content !== 'string') {
		return errorResponse('validation_error', 'content must be a string', 400);
	}

	if (name !== undefined && typeof name !== 'string') {
		return errorResponse('validation_error', 'name must be a string', 400);
	}

	if (is_public !== undefined && typeof is_public !== 'boolean') {
		return errorResponse('validation_error', 'is_public must be a boolean', 400);
	}

	return { content, name, is_public };
}

function toObject(value: unknown): Record<string, unknown> | Response {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return errorResponse('validation_error', 'Request body must be a JSON object', 400);
	}

	return value as Record<string, unknown>;
}
