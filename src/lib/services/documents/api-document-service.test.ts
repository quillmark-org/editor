/**
 * API Document Service Tests
 * Tests for 401 session-expired error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { APIDocumentService } from './api-document-service';
import { SessionExpiredError } from '$lib/errors/session-expired-error';

describe('APIDocumentService - 401 handling', () => {
	let service: APIDocumentService;
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		service = new APIDocumentService();
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	function mock401() {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			json: () => Promise.resolve({ message: 'Unauthorized' })
		});
	}

	function mock500() {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: () => Promise.resolve({ message: 'Server error' })
		});
	}

	it('createDocument throws SessionExpiredError on 401', async () => {
		mock401();
		expect.assertions(1);

		await expect(
			service.createDocument({ owner_id: 'u1', name: 'Test', content: '' })
		).rejects.toBeInstanceOf(SessionExpiredError);
	});

	it('createDocument throws generic Error on non-401 failure', async () => {
		mock500();
		expect.assertions(2);

		await expect(
			service.createDocument({ owner_id: 'u1', name: 'Test', content: '' })
		).rejects.toBeInstanceOf(Error);

		await expect(
			service.createDocument({ owner_id: 'u1', name: 'Test', content: '' })
		).rejects.not.toBeInstanceOf(SessionExpiredError);
	});

	it('getDocumentContent throws SessionExpiredError on 401', async () => {
		mock401();
		expect.assertions(1);

		await expect(
			service.getDocumentContent({ user_id: 'u1', document_id: 'd1' })
		).rejects.toBeInstanceOf(SessionExpiredError);
	});

	it('updateDocumentContent throws SessionExpiredError on 401', async () => {
		mock401();
		expect.assertions(1);

		await expect(
			service.updateDocumentContent({ user_id: 'u1', document_id: 'd1', content: 'test' })
		).rejects.toBeInstanceOf(SessionExpiredError);
	});

	it('updateDocument throws SessionExpiredError on 401', async () => {
		mock401();
		expect.assertions(1);

		await expect(
			service.updateDocument({
				user_id: 'u1',
				document_id: 'd1',
				name: 'New Name',
				content: 'test'
			})
		).rejects.toBeInstanceOf(SessionExpiredError);
	});

	it('updateDocument returns full document with all fields on multi-field update', async () => {
		const fullDoc = {
			id: 'd1',
			owner_id: 'u1',
			name: 'Updated Name',
			content: 'updated content',
			content_size_bytes: 15,
			is_public: true,
			content_hash: 'abc123',
			created_at: '2026-01-01T00:00:00Z',
			updated_at: '2026-03-27T00:00:00Z'
		};
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve(fullDoc)
		});

		const result = await service.updateDocument({
			user_id: 'u1',
			document_id: 'd1',
			name: 'Updated Name',
			content: 'updated content',
			is_public: true
		});

		expect(result).toEqual(fullDoc);
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
	});

	it('updateDocumentName throws SessionExpiredError on 401', async () => {
		mock401();
		expect.assertions(1);

		await expect(
			service.updateDocumentName({ user_id: 'u1', document_id: 'd1', name: 'New Name' })
		).rejects.toBeInstanceOf(SessionExpiredError);
	});

	it('updateDocumentPublic throws SessionExpiredError on 401', async () => {
		mock401();
		expect.assertions(1);

		await expect(
			service.updateDocumentPublic({ user_id: 'u1', document_id: 'd1', is_public: true })
		).rejects.toBeInstanceOf(SessionExpiredError);
	});

	it('deleteDocument throws SessionExpiredError on 401', async () => {
		mock401();
		expect.assertions(1);

		await expect(
			service.deleteDocument({ user_id: 'u1', document_id: 'd1' })
		).rejects.toBeInstanceOf(SessionExpiredError);
	});

	it('listUserDocuments throws SessionExpiredError on 401', async () => {
		mock401();
		expect.assertions(1);

		await expect(service.listUserDocuments({ user_id: 'u1' })).rejects.toBeInstanceOf(
			SessionExpiredError
		);
	});
});
