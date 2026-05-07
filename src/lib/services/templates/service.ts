/**
 * Template Service Implementation
 *
 * Provides singleton service for template manifest loading and template content access.
 */

import { ClientService } from '../base';
import type { TemplateService, TemplateManifest, TemplateMetadata, Template } from './types';
import { TemplateError } from './types';
import { getErrorMessage } from '$lib/errors';

/**
 * Singleton implementation of TemplateService
 */
class TemplateServiceImpl extends ClientService<TemplateServiceImpl> implements TemplateService {
	private manifest: TemplateManifest | null = null;

	/**
	 * Public constructor for singleton pattern compatibility
	 */
	public constructor() {
		super();
	}

	/**
	 * Initialize the Template service with SSR data
	 *
	 * This method allows initializing the service with template data loaded
	 * during server-side rendering, eliminating the need for a client-side fetch.
	 *
	 * @param templates - Template metadata array from SSR
	 */
	initializeWithManifest(templates: TemplateMetadata[]): void {
		this.manifest = { templates };
		// Mark as initialized by calling the protected setter
		// We need to access the initialized flag from the base class
		// Since we can't directly set it, we'll work around this
		this['initialized'] = true;
	}

	/**
	 * Initialize the Template service
	 */
	protected async doInitialize(): Promise<void> {
		// Manifest must be initialized via SSR before calling initialize()
		if (this.manifest === null) {
			throw new TemplateError(
				'not_initialized',
				'Template manifest not initialized. Call initializeWithManifest() with SSR data before initialize().'
			);
		}
	}

	/**
	 * Check if service is ready
	 */
	isReady(): boolean {
		return super.isReady() && this.manifest !== null;
	}

	/**
	 * Get list of template metadata for template selection
	 */
	listTemplates(productionOnly?: boolean): TemplateMetadata[] {
		this.validateInitialized();

		const templates = this.manifest?.templates ?? [];

		// Filter by production flag if requested
		if (productionOnly === true) {
			return templates.filter((t) => t.production === true);
		}

		return templates;
	}

	/**
	 * Get template metadata by filename
	 */
	getTemplateMetadata(filename: string): TemplateMetadata {
		this.validateInitialized();

		const metadata = this.manifest?.templates.find((t) => t.file === filename);
		if (!metadata) {
			const available = this.manifest?.templates.map((t) => t.file).join(', ') ?? 'none';
			throw new TemplateError(
				'not_found',
				`Template "${filename}" not found. Available: ${available}`
			);
		}

		return metadata;
	}

	/**
	 * Get full template with content by filename
	 */
	async getTemplate(filename: string): Promise<Template> {
		this.validateInitialized();

		// Get metadata first (validates template exists)
		const metadata = this.getTemplateMetadata(filename);

		try {
			// Fetch template content
			const response = await fetch(`/templates/${filename}`);
			if (!response.ok) {
				throw new Error(`Failed to load template: ${response.statusText}`);
			}

			const content = await response.text();

			return {
				metadata,
				content
			};
		} catch (error) {
			const message = getErrorMessage(error, 'Unknown error');
			throw new TemplateError('load_error', `Failed to load template "${filename}": ${message}`);
		}
	}

	/**
	 * Validate service is initialized
	 */
	protected validateInitialized(): void {
		super.validateInitialized();
		if (!this.manifest) {
			throw new TemplateError(
				'not_initialized',
				'Template service is not initialized. Call initialize() first.'
			);
		}
	}
}

/**
 * Export singleton instance
 */
export const templateService = TemplateServiceImpl.getInstance();
