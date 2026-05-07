/**
 * New User Setup
 * One-time actions that run when a user account is first created.
 *
 * Called from the Auth.js createUser event in auth.ts, which fires exactly once per user.
 */

import type { UUID } from '$lib/services/auth/types';
import { documentService } from '../documents';
import { loadTemplate } from '../templates';

interface FirstLoginAction {
	id: string;
	description: string;
	execute: (userId: UUID) => Promise<void>;
}

// Add new actions here — they'll automatically run for every new user
const FIRST_LOGIN_ACTIONS: FirstLoginAction[] = [
	{
		id: 'create_welcome_document',
		description: 'Create a welcome memo document for new users',
		async execute(userId: UUID) {
			const content = await loadTemplate('usaf_template.md');
			await documentService.createDocument({
				user_id: userId,
				name: 'My First Memo',
				content
			});
			console.log(`Created welcome document for user ${userId}`);
		}
	}
];

export async function runNewUserSetup(userId: UUID): Promise<void> {
	console.log(`Running ${FIRST_LOGIN_ACTIONS.length} new user setup actions for user ${userId}`);

	for (const action of FIRST_LOGIN_ACTIONS) {
		await action.execute(userId);
	}
}
