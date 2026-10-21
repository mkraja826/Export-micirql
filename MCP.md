# MiCirql Export MCP (Phase 1)

MiCirql Export exposes a **stateless Streamable HTTP MCP endpoint** at `https://export.micirql.com/mcp` for compatible MCP clients, including ChatGPT and Claude where custom remote MCP connectors are supported.

## Security configuration

Configure a strong random Worker secret (never commit it):

```sh
npx wrangler secret put MCP_API_TOKEN
```

Clients must send `Authorization: Bearer <token>`. Without the secret, the endpoint returns 503. This is **private token authentication for testing**, not OAuth or a public app authorization flow. Treat the token as a credential; do not publish it.

## Available tools

- `list_viewports`: lists 8 widths.
- `discover_pages`: reads links on the homepage and the site's sitemap, capped at 40 pages.
- `capture_screenshot`: captures a full-page JPG/PNG at one supported width and returns an MCP image (up to 6 MB).

## Manual protocol smoke test

```sh
curl -i https://export.micirql.com/mcp \
  -H "Authorization: Bearer $MCP_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1"}}}'
```

Then call `tools/list` and `tools/call` with the same headers. This implementation uses one JSON response per request, not server-sent event streaming or sessions.

## Limitations before public release

- Browser Rendering and screenshot API must be verified on a deployed Worker.
- The existing public URL validation is not sufficient SSRF protection for an unrestricted internet-facing capture service. Add DNS and redirect/IP-range protections or an allowlist before broad access.
- Single screenshots only: bulk capture, persistent storage, background jobs, ZIP links, quotas, rate limiting and OAuth are future work.
- A single static bearer token may not meet every client's connector authorization requirements. Validate actual ChatGPT and Claude compatibility before advertising support.
- Never expose this endpoint anonymously or share a token publicly.

## Development

```sh
npm install
npx wrangler deploy --dry-run
```

The GitHub deploy workflow uses Cloudflare secrets for deployment; MCP_API_TOKEN must be set as a **Cloudflare Worker secret** separately.
