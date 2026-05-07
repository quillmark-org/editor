export type FeedbackType = 'bug' | 'feature';

// Escapes characters that GitHub/GitLab interpret in issue bodies.
// In addition to the standard Markdown-active set, `@` and `#` are escaped
// to prevent attacker-controlled fields (reporter name, environment.*) from
// pinging users (`@admin`) or cross-referencing issues (`#123`) when an
// issue is created from feedback.
function escapeMarkdown(s: string): string {
	return s.replace(/[\\`*_[\]|<>@#!]/g, '\\$&').replace(/&/g, '&amp;');
}
export { escapeMarkdown };

export interface FeedbackEnvironment {
	browser?: string;
	os?: string;
	route?: string;
	screen?: string;
}

export interface FeedbackPayload {
	type: FeedbackType;
	title: string;
	description: string;
	environment?: FeedbackEnvironment;
}

export interface FieldErrors {
	[key: string]: string;
}

interface ParseFeedbackResult {
	payload?: FeedbackPayload;
	fields?: FieldErrors;
}

function trimmedString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	return value.trim();
}

function parseEnvironment(
	environment: unknown,
	fields: FieldErrors
): FeedbackEnvironment | undefined | null {
	if (environment === undefined) return undefined;
	if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
		fields.environment = 'must be an object';
		return null;
	}

	const raw = environment as Record<string, unknown>;
	const result: FeedbackEnvironment = {};

	const environmentFieldRules: Array<{ key: keyof FeedbackEnvironment; max: number }> = [
		{ key: 'browser', max: 120 },
		{ key: 'os', max: 120 },
		{ key: 'route', max: 300 },
		{ key: 'screen', max: 120 }
	];

	for (const { key, max } of environmentFieldRules) {
		if (raw[key] === undefined) continue;
		const rawValue = raw[key];
		if (typeof rawValue !== 'string') {
			fields[`environment.${key}`] = 'must be a string';
			continue;
		}

		const value = rawValue.trim();
		if (value.length > max) {
			fields[`environment.${key}`] = `must be ${max} characters or fewer`;
			continue;
		}

		result[key] = value;
	}

	return result;
}

export function parseFeedbackRequest(body: unknown): ParseFeedbackResult {
	const fields: FieldErrors = {};

	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return { fields: { body: 'must be a JSON object' } };
	}

	const payload = body as Record<string, unknown>;

	const type = trimmedString(payload.type);
	const title = trimmedString(payload.title);
	const description = trimmedString(payload.description);

	if (!type) {
		fields.type = 'is required';
	} else if (!['bug', 'feature'].includes(type)) {
		fields.type = 'must be one of: bug, feature';
	}

	if (!title) {
		fields.title = 'is required';
	} else if (title.length > 120) {
		fields.title = 'must be 120 characters or fewer';
	}

	if (!description) {
		fields.description = 'is required';
	} else if (description.length < 10 || description.length > 5000) {
		fields.description = 'must be between 10 and 5000 characters';
	}

	const environment = parseEnvironment(payload.environment, fields);

	if (Object.keys(fields).length > 0) {
		return { fields };
	}

	return {
		payload: {
			type: type as FeedbackType,
			title: title as string,
			description: description as string,
			environment: environment == null ? undefined : environment
		}
	};
}

export function buildFeedbackIssueBody(params: {
	feedback: FeedbackPayload;
	reporterName: string;
	reporterEmail: string;
}): string {
	const { feedback, reporterName, reporterEmail } = params;

	// Reporter and environment values originate from session/DB/client and
	// land in a Markdown issue body that maintainers read in GitHub/GitLab.
	// Every interpolated field must run through escapeMarkdown to prevent
	// @-mention, link, and HTML/comment injection.
	const lines = [
		'## Reporter',
		`${escapeMarkdown(reporterName)} <${escapeMarkdown(reporterEmail)}>`,
		'',
		'## Description',
		escapeMarkdown(feedback.description)
	];

	const environmentLines: string[] = [];
	if (feedback.environment?.browser)
		environmentLines.push(`- Browser: ${escapeMarkdown(feedback.environment.browser)}`);
	if (feedback.environment?.os)
		environmentLines.push(`- OS: ${escapeMarkdown(feedback.environment.os)}`);
	if (feedback.environment?.route)
		environmentLines.push(`- Route: ${escapeMarkdown(feedback.environment.route)}`);
	if (feedback.environment?.screen)
		environmentLines.push(`- Screen: ${escapeMarkdown(feedback.environment.screen)}`);

	if (environmentLines.length > 0) {
		lines.push('', '## Environment', ...environmentLines);
	}

	return lines.join('\n');
}
