export type ChangelogVersion = {
	version: string;
	fromYourFeedback: string[];
	added: string[];
	fixed: string[];
};

type Category = 'fromYourFeedback' | 'added' | 'fixed' | null;

const VERSION_HEADER = /^##\s+\[v(\d+\.\d+\.\d+)\]/;
const CATEGORY_HEADER = /^###\s+(.+?)\s*$/;
const BULLET = /^-\s+(.*)$/;

function mapCategory(name: string): Category {
	const normalized = name.trim().toLowerCase();
	if (normalized === 'from your feedback') return 'fromYourFeedback';
	if (normalized === 'added') return 'added';
	if (normalized === 'fixed') return 'fixed';
	return null;
}

function emptyVersion(version: string): ChangelogVersion {
	return { version, fromYourFeedback: [], added: [], fixed: [] };
}

export function parseChangelog(raw: string): ChangelogVersion[] {
	const lines = raw.split('\n');
	const versions: ChangelogVersion[] = [];
	let current: ChangelogVersion | null = null;
	let category: Category = null;

	for (const line of lines) {
		const versionMatch = line.match(VERSION_HEADER);
		if (versionMatch) {
			if (current) versions.push(current);
			current = emptyVersion(versionMatch[1]);
			category = null;
			continue;
		}

		if (!current) continue;

		const categoryMatch = line.match(CATEGORY_HEADER);
		if (categoryMatch) {
			category = mapCategory(categoryMatch[1]);
			continue;
		}

		if (!category) continue;

		const bulletMatch = line.match(BULLET);
		if (bulletMatch) {
			current[category].push(bulletMatch[1].trim());
			continue;
		}

		const continuation = line.trim();
		if (continuation && current[category].length > 0) {
			const list = current[category];
			list[list.length - 1] = `${list[list.length - 1]} ${continuation}`;
		}
	}

	if (current) versions.push(current);

	return versions.filter((v) => v.fromYourFeedback.length + v.added.length + v.fixed.length > 0);
}
