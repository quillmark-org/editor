import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getSession } from '$lib/server/utils/auth';
import { getDb, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import {
	buildFeedbackIssueBody,
	escapeMarkdown,
	parseFeedbackRequest
} from '$lib/server/services/feedback';
import { resolveGitLabIssuesPostUrl } from '$lib/server/services/feedback/gitlab-url';
import { getServerConfig } from '$lib/config/load.server';

const FEEDBACK_TITLE_PREFIX = '[Beta Feedback] ';
const FEEDBACK_LABELS = ['beta-feedback'];

function errorBody(code: string, message: string, fields?: Record<string, string>) {
	return json(
		{
			error: {
				code,
				message,
				...(fields ? { fields } : {})
			}
		},
		{
			status:
				code === 'UNAUTHORIZED'
					? 401
					: code === 'VALIDATION_ERROR'
						? 400
						: code === 'MISSING_REPORTER_EMAIL'
							? 422
							: code === 'UPSTREAM_ERROR'
								? 502
								: 500
		}
	);
}

function isJsonContentType(contentType: string | null): boolean {
	if (!contentType) return false;
	const mimeType = contentType.split(';')[0]?.trim().toLowerCase();
	return mimeType === 'application/json';
}

async function createGitHubIssue(params: {
	token: string;
	title: string;
	body: string;
	type: string;
}): Promise<{ id: number; url: string } | null> {
	const { token, title, body, type } = params;

	let upstreamResponse: Response;
	try {
		upstreamResponse = await fetch(
			'https://api.github.com/repos/nibsbin/tonguetoquill-web/issues',
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					Accept: 'application/vnd.github+json',
					'User-Agent': 'tonguetoquill-web-feedback'
				},
				body: JSON.stringify({
					title,
					body,
					labels: [...FEEDBACK_LABELS, type]
				})
			}
		);
	} catch (error) {
		console.error('Failed to submit beta feedback issue to GitHub:', error);
		return null;
	}

	if (!upstreamResponse.ok) {
		console.error('GitHub issues API rejected beta feedback submission:', upstreamResponse.status);
		return null;
	}

	let issue: unknown;
	try {
		issue = await upstreamResponse.json();
	} catch (error) {
		console.error('Failed to parse GitHub issue creation response:', error);
		return null;
	}

	const issueNumber =
		typeof (issue as { number?: unknown })?.number === 'number'
			? (issue as { number: number }).number
			: null;
	const issueUrl =
		typeof (issue as { html_url?: unknown })?.html_url === 'string'
			? (issue as { html_url: string }).html_url
			: null;

	if (!issueNumber || !issueUrl) {
		console.error('GitHub issue response missing required fields');
		return null;
	}

	return { id: issueNumber, url: issueUrl };
}

async function createGitLabIssue(params: {
	issuesPostUrl: string;
	token: string;
	title: string;
	body: string;
	type: string;
}): Promise<{ id: number; url: string } | null> {
	const { issuesPostUrl, token, title, body, type } = params;

	let upstreamResponse: Response;
	try {
		upstreamResponse = await fetch(issuesPostUrl, {
			method: 'POST',
			headers: {
				'PRIVATE-TOKEN': token,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				title,
				description: body,
				labels: [...FEEDBACK_LABELS, type].join(',')
			})
		});
	} catch (error) {
		console.error('Failed to submit beta feedback issue to GitLab:', error);
		return null;
	}

	if (!upstreamResponse.ok) {
		console.error('GitLab issues API rejected beta feedback submission:', upstreamResponse.status);
		return null;
	}

	let issue: unknown;
	try {
		issue = await upstreamResponse.json();
	} catch (error) {
		console.error('Failed to parse GitLab issue creation response:', error);
		return null;
	}

	const issueNumber =
		typeof (issue as { iid?: unknown })?.iid === 'number' ? (issue as { iid: number }).iid : null;
	const issueUrl =
		typeof (issue as { web_url?: unknown })?.web_url === 'string'
			? (issue as { web_url: string }).web_url
			: null;

	if (!issueNumber || !issueUrl) {
		console.error('GitLab issue response missing required fields');
		return null;
	}

	return { id: issueNumber, url: issueUrl };
}

export const POST: RequestHandler = async (event) => {
	try {
		const session = await getSession(event);
		const userId = session?.user?.id;

		if (!userId) {
			return errorBody('UNAUTHORIZED', 'Authentication required.');
		}

		if (!isJsonContentType(event.request.headers.get('content-type'))) {
			return errorBody('VALIDATION_ERROR', 'Request validation failed.', {
				contentType: 'must be application/json'
			});
		}

		let body: unknown;
		try {
			body = await event.request.json();
		} catch {
			return errorBody('VALIDATION_ERROR', 'Invalid JSON in request body.', {
				body: 'must be valid JSON'
			});
		}

		const parsed = parseFeedbackRequest(body);
		if (!parsed.payload) {
			return errorBody('VALIDATION_ERROR', 'Request validation failed.', parsed.fields);
		}

		const db = await getDb();
		const [userRecord] = await db
			.select({ name: schema.users.name, email: schema.users.email })
			.from(schema.users)
			.where(eq(schema.users.id, userId))
			.limit(1);

		const reporterEmail = (session.user?.email ?? userRecord?.email ?? '').trim();
		if (!reporterEmail) {
			return errorBody(
				'MISSING_REPORTER_EMAIL',
				'Your account is missing an email address. Contact support.'
			);
		}

		const reporterName = (session.user?.name ?? userRecord?.name ?? '').trim() || 'Unknown';
		const feedback = parsed.payload;
		const { upstream } = getServerConfig().features.feedback;

		if (upstream === 'none') {
			return errorBody('UPSTREAM_ERROR', 'Feedback submission is disabled for this deployment.');
		}

		const title = `${FEEDBACK_TITLE_PREFIX}${escapeMarkdown(feedback.title)}`;
		const issueBody = buildFeedbackIssueBody({ feedback, reporterName, reporterEmail });

		let issue: { id: number; url: string } | null = null;
		if (upstream === 'github') {
			issue = await createGitHubIssue({
				token: env.FEEDBACK_GITHUB_KEY!,
				title,
				body: issueBody,
				type: feedback.type
			});
		} else if (upstream === 'gitlab') {
			const gitlabIssuesPostUrl = resolveGitLabIssuesPostUrl(env.FEEDBACK_GITLAB_URL!);
			if (!gitlabIssuesPostUrl) {
				return errorBody('UPSTREAM_ERROR', 'FEEDBACK_GITLAB_URL is not a valid project endpoint');
			}
			issue = await createGitLabIssue({
				issuesPostUrl: gitlabIssuesPostUrl,
				token: env.FEEDBACK_GITLAB_KEY!,
				title,
				body: issueBody,
				type: feedback.type
			});
		}

		if (!issue) {
			return errorBody('UPSTREAM_ERROR', 'Unable to submit feedback right now.');
		}

		return json(issue, { status: 201 });
	} catch (error) {
		console.error('Unexpected /api/feedback error:', error);
		return json(
			{
				error: {
					code: 'UPSTREAM_ERROR',
					message: 'Unable to submit feedback right now.'
				}
			},
			{ status: 500 }
		);
	}
};
