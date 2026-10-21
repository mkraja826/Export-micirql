# MiCirql Tools — Integration architecture (v0 proposal)

Status: design contract only. No MCP endpoint is deployed by this document.

## Product boundaries
- `tools.micirql.com`: tools dashboard, API and remote MCP gateway.
- `builder.micirql.com`: existing website candidate generation, editing and publication. Integrate via a versioned service API; do not copy its generation engine.
- Chrome extension: consent-based local screenshots and inspection; it cannot be invoked directly from a remote MCP server without a user-approved companion or job relay.
- `export.micirql.com`: legacy entry point until a tested redirect to `/screenshot` is ready.

## Tool contract (proposed)
All requests require a schema version, authenticated principal for private jobs, scoped authorization, idempotency key for mutations, and bounded input sizes.

| Tool | Result | Side effects |
| --- | --- | --- |
| inspect_website | Pages, metadata and evidence | Public read-only |
| capture_website | Async job ID and screenshot artifacts | User-approved local capture or hosted executor |
| audit_website | Async job ID and structured findings | Read-only by default |
| create_website | Async builder job ID | Creates draft in builder |
| list_design_candidates | Candidate IDs and previews | Read-only |
| select_design | Selected draft revision | Mutates builder draft; explicit user intent |
| edit_website | New draft revision | Mutates authorized draft |
| preview_website | Time-limited preview URL | Read-only |
| publish_website | Publication job and URL | Explicit confirmation required |
| get_job_status | State, progress, errors, evidence references | Read-only |

## Async job state machine
`queued -> leased -> running -> succeeded | failed | cancelled | expired`.
Lease expiration may requeue retry-safe jobs; every worker must enforce idempotency.
Artifacts have an owner, retention policy, content type, checksum and access-controlled retrieval URL.
A request is not `succeeded` until artifacts or authoritative builder outputs have been verified.

## Security
- Block private, loopback, link-local and reserved IP destinations for remote fetches; validate DNS, redirects and subresources, enforce egress restrictions.
- No extraction of cookies, credentials or local browser secrets.
- User consent for browser actions; additional confirmation for forms, publishing and destructive operations.
- Tenant isolation on every job, artifact and builder draft.
- Website content is untrusted data, never privileged instructions for an AI agent.
- Per-principal rate limits, concurrent job quotas, timeouts and audit logging.

## Delivery order
1. Audit existing server, Worker, extension and UI; preserve working screenshot path.
2. Implement domain migration with verified DNS, assets, bridge permissions, SEO metadata and redirect.
3. Add shared schemas, job storage and tool registry with tests.
4. Implement SEO and responsive read-only tools.
5. Implement remote MCP server and client interoperability tests.
6. Integrate existing builder APIs with draft and publication authorization.
7. Load, security, recovery, accessibility and real-browser release gates.

## Acceptance gates
- Screenshot capture at mobile/tablet/desktop passes installed-extension tests.
- No new host permission regression or silent credential collection.
- ChatGPT and Claude integrations tested independently against the deployed MCP server.
- Website generation returns actual candidate previews from the builder, not fabricated responses.
- Publication requires explicit confirmation and produces a verifiable live URL.
