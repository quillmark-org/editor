import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerQuillmarkTools } from './quillmark-tools';

export function buildMcpServer(): McpServer {
	const server = new McpServer(
		{
			name: 'tonguetoquill',
			version: '0.1.0',
			description:
				'Write formatted documents (e.g., memos, forms, resumes) with Quillmark Markdown engine'
		},
		{
			capabilities: { tools: {} },
			instructions: `list_quills -> get_specs -> create_document -> surface url to user as markdown link`
		}
	);
	registerQuillmarkTools(server);
	return server;
}
