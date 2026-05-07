/**
 * Ephemeral Document Page — Claim Flow
 *
 * Unauthenticated visitors are redirected to sign-in with a callback back
 * here so the user lands on the page after signing in. Once authenticated:
 *   - If the document is unclaimed → atomically claim it for this user.
 *   - If already claimed by this user → show the draft.
 *   - If claimed by someone else    → show the "claimed by another" page.
 *   - If missing or expired         → ambiguous 404.
 */

import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { isValidUUID } from '$lib/server/utils/api';
import { logAmbiguousResponse } from '$lib/server/utils/ambiguous-response-logging';
import { claimEphemeralDocument } from '$lib/server/services/ephemeral-documents';
import { getServerConfig } from '$lib/config/load.server';

export const load: PageServerLoad = async (event) => {
	if (!getServerConfig().features.mcp.enabled) {
		error(404, { message: 'Document not found' });
	}

	const id = event.params.id;
	if (!isValidUUID(id)) {
		error(404, { message: 'Document not found' });
	}

	const session = await event.locals.auth();
	if (!session?.user?.id) {
		const callbackUrl = event.url.pathname + event.url.search;
		throw redirect(303, `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
	}

	event.depends(`app:ephemeral-document-${id}`);

	try {
		const result = await claimEphemeralDocument({ userId: session.user.id, id });

		if (result.kind === 'not_found') {
			logAmbiguousResponse(event, {
				route: '/ephemeral/[id]',
				externalStatus: 404,
				reason: 'ephemeral_not_found',
				resourceId: id,
				userId: session.user.id
			});
			error(404, { message: 'Document not found' });
		}

		if (result.kind === 'expired') {
			return {
				state: 'expired' as const
			};
		}

		if (result.kind === 'claimed_by_other') {
			return {
				state: 'claimed_by_other' as const
			};
		}

		const eph = result.doc;
		return {
			state: 'owned' as const,
			document: {
				id: eph.id,
				name: eph.name,
				content: eph.content,
				owner_display_name: eph.authorDisplayName ?? 'you'
			},
			expiresAt: eph.expiresAt.toISOString()
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		logAmbiguousResponse(event, {
			route: '/ephemeral/[id]',
			externalStatus: 404,
			reason: 'exception_during_ephemeral_claim',
			error: err,
			resourceId: id,
			userId: session.user.id
		});
		error(404, { message: 'Document not found' });
	}
};
