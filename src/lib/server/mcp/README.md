# MCP server

Server-side glue for the `/mcp` Model Context Protocol endpoint. This module
builds the `McpServer` instance and registers the Quillmark tool surface
against it; the SvelteKit route handler at `src/routes/mcp/+server.ts` is the
HTTP entrypoint that wires a transport in front of it.

## Files

| File                             | Role                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `server.ts`                      | `buildMcpServer()` — constructs an `McpServer` with `capabilities: { tools: {} }` and applies the tool registrations.          |
| `quillmark-tools.ts`             | Registers the three tools (`list_quills`, `get_blueprint`, `create_document`) directly against this app's services.            |
| `../../../routes/mcp/+server.ts` | SvelteKit `RequestHandler`. Builds a fresh server + transport per request and delegates to `transport.handleRequest(request)`. |

## Transport

The endpoint speaks the MCP **Streamable HTTP** transport from
`@modelcontextprotocol/sdk`, configured in two non-default ways:

- `sessionIdGenerator: undefined` → **stateless mode**. No session IDs are
  issued; every request stands alone. We don't need server-initiated
  messages, multi-turn sessions, or resource subscriptions, so there's no
  state worth keeping between calls.
- `enableJsonResponse: true` → **JSON-response mode**. The server returns a
  single buffered `application/json` body with the JSON-RPC result instead
  of an SSE stream. The Streamable HTTP transport defaults to SSE, but
  streaming buys us nothing for single-shot tool calls and behaves poorly
  on Vercel's serverless functions, which prefer fully buffered responses.

A fresh `McpServer` + transport pair is built per request — the SDK requires
a fresh transport when stateless and `McpServer.connect(transport)` is
cheap, so we don't bother caching either.

The handler responds to `GET`, `POST`, and `DELETE` (the Streamable HTTP
spec uses each verb); `transport.handleRequest` dispatches internally.

## Auth

**The `/mcp` endpoint itself is unauthenticated.** There is no bearer token,
no API key, no `X-User-Id` header. Any caller that can reach the endpoint
can invoke any tool.

Trust instead lives in the **claim flow** for `create_document`:

1. A caller creates a draft. The row is written with `owner_id = null` and
   a 5-minute `expires_at` (the claim deadline).
2. The endpoint returns the URL (`/ephemeral/<id>`) plus the deadline.
   No state about _who_ created it is recorded.
3. The first authenticated viewer to load that URL atomically claims
   ownership (CAS on `owner_id`), and `expires_at` is bumped to +1 h.
4. If no one claims by the deadline, the cron sweep deletes the row.

This is enforced by `features.mcp.enabled` requiring `features.cron.enabled`
in the deployment config — without the sweeper, unclaimed drafts would
outlive their TTL and break the ephemeral privacy contract. The schema
refinement that enforces this lives in `src/lib/config/schema.ts`.

The endpoint is feature-gated: when `features.mcp.enabled` is false, the
handler returns `404 Not Found` before doing any MCP work.

## Tool surface

All three tools accept JSON-RPC `tools/call` requests and return both a
`content[]` (text) summary for clients that prefer plain text and a
`structuredContent` payload for clients that consume JSON.

### Typical workflow

1. **`list_quills`** → discover available quill templates
2. **`get_blueprint`** → fetch the form schema for your chosen quill (defines what fields and cards are valid)
3. **`create_document`** → author markdown with valid QUILL frontmatter + optional author name, generate shareable link

### `list_quills`

- Input: none.
- Output: catalog of available quills (`name`, `version`, …) read from
  `static/` via `loadQuillManifestFromStatic()`.

### `get_blueprint`

- Input: `{ quill: string }` — bare name (resolves to latest) or
  `name@version`.
- Output: the quill's Markdown blueprint. Used by the LLM to author valid frontmatter and cards.

### `create_document`

- Input: `{ name: string, content: string, author?: string }` — document
  title, markdown body with `QUILL:` frontmatter (validated against the
  target quill's schema), and optional display name shown to readers as
  the document author.
- Output: `{ url, claim_deadline, user_warning }`. The text variant
  presents the URL, the ISO-8601 deadline, and the user warning on
  separate lines.
- Side effect: writes an unclaimed row via `createEphemeralDocument()`.

## Why not `@quillmark/mcp`?

The package exists (`@quillmark/mcp@0.1.0`) but assumes the host has a
`Quiver` + `Quillmark` engine pair to drive its primitives, and supplies a
`Deliverer` callback to handle persistence. This deployment already has:

- a manifest loader (`loadQuillManifestFromStatic`),
- a service layer (`quillmarkServerService`),
- and an ephemeral-document persistence + claim flow.

Adopting the package would require standing up the engine in this server
process in parallel to the existing services, writing a one-line
`Deliverer` that delegates back to `createEphemeralDocument`, and changing
the LLM-facing input/output shapes. The package is the right fit for a
vanilla Quillmark deployment that doesn't already have these layers; here
it would replace one indirection with another for no functional gain.

If `@quillmark/mcp` later grows a host-services integration that matches
what we already have, this module is the place to switch over — its
boundaries are deliberately shaped around what registration looks like
externally (`registerQuillmarkTools(server)`).

## Lifecycle / failure modes worth knowing

- `create_document` validates `name` and `content` via
  `DocumentValidator`; size and length errors come back as JSON-RPC errors
  surfaced through the SDK.
- The 5-minute unclaimed TTL is a strict upper bound on how long an
  unsolicited URL can sit in chat history before becoming invalid. If a
  recipient signs in after the deadline they'll see a "not found" page,
  not a claim form.
- Because creation is unauthenticated and stateless, there is no
  per-caller rate limiting at this layer. Add it at the edge (or at the
  cron-gated TTL) if abuse becomes a concern.
