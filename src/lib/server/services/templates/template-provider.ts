/**
 * Template Library Service Provider Factory
 */

import type { TemplateLibraryServiceContract } from './types';
import { DrizzleTemplateLibraryService } from './template-drizzle-service';

let service: TemplateLibraryServiceContract | null = null;

export function getTemplateLibraryService(): TemplateLibraryServiceContract {
	if (!service) {
		service = new DrizzleTemplateLibraryService();
	}
	return service;
}
