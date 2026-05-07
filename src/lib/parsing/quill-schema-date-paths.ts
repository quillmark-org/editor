/**
 * Date-path patterns derived from a Quillmark schema. Built by
 * `collectDatePaths` (which walks `quill.schema.main` and `quill.schema.card_types`)
 * and consumed by client-side legacy date repair (`runClientDocumentRepairs`).
 *
 * Paths are dot-separated from the document-YAML root; `*` matches one array
 * index segment.
 */
import type { Quill } from '@quillmark/wasm';

export interface QuillSchemaDatePaths {
	frontmatter: string[];
	cards: Map<string, string[]>;
}

export function collectDatePaths(quill: Quill): QuillSchemaDatePaths {
	const quillSchema = quill.schema;
	const frontmatter = collectDatePathsFromFields(quillSchema.main.fields);
	const cards = new Map<string, string[]>();
	const cardTypes = (quillSchema.card_types ?? {}) as Record<string, { fields?: Record<string, unknown> }>;
	for (const [tag, cardSchema] of Object.entries(cardTypes)) {
		cards.set(tag, collectDatePathsFromFields(cardSchema.fields));
	}
	return { frontmatter, cards };
}

function collectDatePathsFromFields(fields: Record<string, unknown> | undefined): string[] {
	const out: string[] = [];
	if (!fields) return out;
	walkFieldTree(fields, '', out);
	return out;
}

function walkFieldTree(fields: Record<string, unknown>, prefix: string, sink: string[]): void {
	for (const [name, raw] of Object.entries(fields)) {
		if (!raw || typeof raw !== 'object') continue;
		const def = raw as Record<string, unknown>;
		const path = prefix ? `${prefix}.${name}` : name;

		if (def.type === 'date') {
			sink.push(path);
			continue;
		}

		const nestedFields = def.properties as Record<string, unknown> | undefined;
		const itemFields =
			def.type === 'array' && def.items && typeof def.items === 'object'
				? ((def.items as Record<string, unknown>).properties as Record<string, unknown> | undefined)
				: undefined;

		if (nestedFields && def.type !== 'array') {
			walkFieldTree(nestedFields, path, sink);
		} else if (itemFields) {
			walkFieldTree(itemFields, `${path}.*`, sink);
		}
	}
}
