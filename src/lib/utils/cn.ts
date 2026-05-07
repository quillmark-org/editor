/**
 * Minimal class-name helper. Strings/objects/arrays are flattened; truthy
 * keys from objects become class names. Falsy values are dropped.
 *
 * The reference implementation used `clsx + tailwind-merge`. The package is
 * Tailwind-free, so simple concatenation is enough — no merge logic required.
 */

type ClassValue =
	| string
	| number
	| null
	| undefined
	| false
	| Record<string, unknown>
	| ClassValue[];

function flatten(input: ClassValue, out: string[]): void {
	if (!input) return;
	if (typeof input === 'string' || typeof input === 'number') {
		out.push(String(input));
		return;
	}
	if (Array.isArray(input)) {
		for (const item of input) flatten(item, out);
		return;
	}
	if (typeof input === 'object') {
		for (const key in input) {
			if (input[key]) out.push(key);
		}
	}
}

export function cn(...inputs: ClassValue[]): string {
	const parts: string[] = [];
	for (const input of inputs) flatten(input, parts);
	return parts.join(' ');
}
