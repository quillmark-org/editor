// Stand-in for the future `@quillmark/mcp` package; module boundary is
// shaped to match what that package will export.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Diagnostic } from '@quillmark/wasm';
import { quillmarkServerService } from '$lib/server/services/quillmark/service';
import {
	createEphemeralDocument,
	type CreateEphemeralResult
} from '$lib/server/services/ephemeral-documents/ephemeral-document-service';
import { getOrigin } from '$lib/server/utils/api';

function formatDiagnostic(d: Diagnostic): string {
	const parts = [`[${d.severity}] ${d.message}`];
	if (d.hint) parts.push(`  Hint: ${d.hint}`);
	if (d.location) parts.push(`  At: ${d.location.file}:${d.location.line}:${d.location.column}`);
	return parts.join('\n');
}

export function registerQuillmarkTools(server: McpServer): void {
	server.registerTool(
		'list_quills',
		{
			description: 'List available document formats (quills).',
			inputSchema: {},
			outputSchema: {
				quills: z.array(
					z.object({
						name: z.string(),
						version: z.string(),
						description: z.string().optional()
					})
				)
			}
		},
		async () => {
			const quills = await quillmarkServerService.listQuills();
			const payload = { quills };
			return {
				content: [
					{
						type: 'text',
						text: quills
							.map((q) => [q.name + '@' + q.version, q.description].filter(Boolean).join(': '))
							.join('\n')
					}
				],
				structuredContent: payload
			};
		}
	);

	server.registerTool(
		'get_specs',
		{
			description:
				'Learn how to compose a document in a specific quill format. Should be called before `create_document`.',
			inputSchema: {
				quill: z.string().min(1).describe('Either base name for latest or `name@version`.')
			},
			outputSchema: {
				instruction: z.string(),
				blueprint: z.string()
			}
		},
		async ({ quill }) => {
			const { blueprint } = await quillmarkServerService.getQuillBlueprint(quill);
			const instruction = `The blueprint below specifies the YAML block and markdown body standards for the \`${quill}\` quill. To compose a document, write a single markdown string that begins with a \`---\` YAML block containing \`QUILL: ${quill}\` plus every field the blueprint marks required, followed by \`---\` and the markdown body. Pass that string as \`content\` to \`create_document\`.`;
			return {
				content: [
					{
						type: 'text',
						text: `${instruction}\n\n${blueprint}`
					}
				],
				structuredContent: { instruction, blueprint }
			};
		}
	);

	server.registerTool(
		'create_document',
		{
			description:
				'Create an unclaimed ephemeral document on the web editor. Call `list_quills` then `get_specs` first to learn how to compose `content` for the chosen quill format.',
			inputSchema: {
				name: z.string().min(1).max(255).describe('Document title shown to the user.'),
				content: z
					.string()
					.min(1)
					.describe(
						'Document body as quill-compliant markdown with YAML metadata blocks. Retrieve the format spec via `get_specs` before composing.'
					),
				author: z.string().min(1).max(100).optional().describe('Author display name.')
			}
		},
		async ({ name, content, author }) => {
			let diagnostics: Diagnostic[];
			try {
				diagnostics = await quillmarkServerService.projectDocument(content);
			} catch (err) {
				return {
					isError: true,
					content: [
						{
							type: 'text',
							text: `Document parse failed: ${err instanceof Error ? err.message : String(err)}`
						}
					]
				};
			}

			const errors = diagnostics.filter((d) => d.severity === 'error');
			if (errors.length > 0) {
				return {
					isError: true,
					content: [
						{
							type: 'text',
							text: ['Document validation errors:', '', ...errors.map(formatDiagnostic)].join('\n')
						}
					]
				};
			}

			let result: CreateEphemeralResult;
			try {
				result = await createEphemeralDocument({
					name,
					content,
					authorDisplayName: author
				});
			} catch (err) {
				return {
					isError: true,
					content: [
						{
							type: 'text',
							text: `Failed to create ephemeral document: ${err instanceof Error ? err.message : String(err)}`
						}
					]
				};
			}

			const base = getOrigin().replace(/\/$/, '');
			const url = `${base}/ephemeral/${result.id}`;

			return {
				content: [
					{ type: 'text', text: `[${name}](${url})` },
					{ type: 'resource_link', uri: url, name, mimeType: 'text/html' }
				],
				structuredContent: { url, title: name }
			};
		}
	);
}
