/**
 * Auto-Save Utility
 * Provides debounced auto-save functionality with status tracking
 */

import { documentStore } from '$lib/stores/documents.svelte';
import { getErrorMessage } from '$lib/errors';
import { SessionExpiredError } from '$lib/errors/session-expired-error';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveState {
	status: SaveStatus;
	errorMessage?: string;
}

/**
 * AutoSave class to manage document saving with debounce
 *
 * @param debounceMs - Debounce delay in milliseconds (default: 2000ms)
 *                     See DESIGN_SYSTEM.md Auto-Save Behavior for rationale
 */
export class AutoSave {
	private debounceTimer: number | undefined;
	private saveDebounceMs: number;
	private state = $state<SaveState>({
		status: 'idle'
	});

	constructor(debounceMs: number = 2000) {
		this.saveDebounceMs = debounceMs;
	}

	/**
	 * Get current save state
	 */
	get saveState(): SaveState {
		return this.state;
	}

	/**
	 * Schedule a save with debounce
	 * @param documentId - Document ID to save
	 * @param content - Content to save
	 */
	scheduleSave(documentId: string, content: string): void {
		// Clear existing timer
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		// Schedule new save
		this.debounceTimer = window.setTimeout(() => {
			this.saveNow(documentId, content);
		}, this.saveDebounceMs);
	}

	/**
	 * Save immediately (bypasses debounce)
	 * Used for auto-saving when switching documents
	 */
	async saveNow(documentId: string, content: string): Promise<void> {
		// Clear any pending debounced save
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = undefined;
		}

		this.state.status = 'saving';
		this.state.errorMessage = undefined;

		try {
			await documentStore.saveDocument(documentId, content);

			this.state.status = 'saved';

			// Auto-hide saved status after 3 seconds
			setTimeout(() => {
				if (this.state.status === 'saved') {
					this.state.status = 'idle';
				}
			}, 3000);
		} catch (err) {
			if (!(err instanceof SessionExpiredError)) {
				this.state.status = 'error';
				this.state.errorMessage = getErrorMessage(err, 'Failed to save document');
			}
			throw err;
		}
	}

	/**
	 * Cancel any pending save
	 */
	cancelPendingSave(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = undefined;
		}
	}

	/**
	 * Check if there's a pending save
	 */
	hasPendingSave(): boolean {
		return this.debounceTimer !== undefined;
	}

	/**
	 * Reset save state
	 */
	reset(): void {
		this.cancelPendingSave();
		this.state.status = 'idle';
		this.state.errorMessage = undefined;
	}
}
