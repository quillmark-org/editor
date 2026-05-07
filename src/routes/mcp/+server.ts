/**
 * MCP JSON-RPC endpoint. Stateless, JSON-response mode — fresh transport
 * per request, buffered application/json out.
 *
 * Only POST is exported. GET is omitted because the SDK's GET handler opens a
 * long-lived SSE ReadableStream for server-initiated messages that never closes,
 * causing a 300-second Vercel timeout. DELETE is omitted because in stateless
 * mode there is no session to terminate; returning 405 is more honest than a
 * no-op 200.
 *
 * Auth: none. `create_document` returns an unclaimed URL; the first
 * authenticated viewer at /ephemeral/<id> claims ownership.
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerConfig } from '$lib/config/load.server';
import { buildMcpServer } from '$lib/server/mcp/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

async function handle(request: Request): Promise<Response> {
	if (!getServerConfig().features.mcp.enabled) {
		error(404, 'Not found');
	}

	const server = buildMcpServer();
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true
	});

	await server.connect(transport);
	return transport.handleRequest(request);
}

export const POST: RequestHandler = ({ request }) => handle(request);
