/**
 * Content Hash Utility
 * MD5 hex digest for divergence detection between document and template content.
 * Not used for security — purely for detecting whether content has changed.
 */

import { createHash } from 'crypto';

export function computeContentHash(content: string): string {
	return createHash('md5').update(content, 'utf-8').digest('hex');
}
