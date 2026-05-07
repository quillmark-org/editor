/**
 * FEEDBACK_GITLAB_URL is the REST project URL through `.../api/v4/projects/<id-or-encoded-path>`
 * (with or without a trailing `/issues`). Numeric ID or URL-encoded path as in GitLab docs.
 */
const ALLOWED_GITLAB_HOSTS = new Set(['gitlab.com', 'sync.git.mil']);

export function resolveGitLabIssuesPostUrl(raw: string): string | null {
	const trimmed = raw.trim().replace(/\/+$/, '');

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}

	if (parsed.protocol !== 'https:') {
		return null;
	}

	if (!ALLOWED_GITLAB_HOSTS.has(parsed.hostname)) {
		return null;
	}

	if (!trimmed.includes('/api/v4/projects/')) {
		return null;
	}

	return trimmed.endsWith('/issues') ? trimmed : `${trimmed}/issues`;
}
