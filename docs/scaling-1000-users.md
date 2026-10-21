# MiCirql Export — 1,000 concurrent-user architecture

## Capacity boundary
The current Cloudflare Browser Rendering Free-plan Quick Action is a shared constrained rendering resource. Delaying each browser tab by 11 seconds does not coordinate 1,000 tabs. Never claim that this configuration supports 1,000 simultaneous screenshot jobs.

## Request contract
POST /api/jobs accepts a normalized public URL, up to two main pages (home plus one), a subset of 375/768/1440 widths, and jpg/png. It returns HTTP 202 with job ID, estimated queue position if known, and status URL. Do not synchronously render within the request.

GET /api/jobs/:id returns queued/running/partial/completed/failed, per-capture results, and retry guidance. Clients poll with jitter and backoff. GET /api/jobs/:id/download serves an expiring archive when complete.

## Shared scheduling
Use a persistent job store and a single shared queue/scheduler, not per-browser delays. Apply per-user/IP quotas, a global concurrency ceiling determined by the rendering provider, and a daily capacity budget. Reject or defer excess load with HTTP 429/503 and Retry-After. Support cancellation, expiry, dead-letter jobs, bounded retries, and idempotency keys.

## Renderer pool
Separate the renderer from the Cloudflare frontend. Deploy Playwright workers on infrastructure with measurable CPU/RAM capacity. Start with one worker, benchmark average render seconds and memory for real sites, then horizontally scale. An account with no funded renderer capacity cannot promise fast service for 6,000 distinct screenshots.

## Cache and storage
Cache by canonical URL + viewport + format + render version + freshness window. Deduplicate in-flight identical captures. Store screenshots and archives in object storage; serve through signed short-lived links/CDN. Limit full-page height, bytes, redirects, render time, and pages per job. Add TTL cleanup.

## Security
Public URL text checks alone are insufficient for SSRF. Resolve DNS at render time and block loopback, private, link-local, metadata and reserved networks across redirects and DNS rebinding. Isolate browsers, limit outbound access and downloads, and rate-limit abusive origins.

## Delivery stages
1. Instrument live 429 rates and render duration; retain current synchronous API as legacy.
2. Implement durable job records and shared admission control; frontend shows queue states.
3. Add separate Playwright worker, persistent results and ZIP downloads.
4. Add caching/deduplication and safe URL/network policies.
5. Load test 100, then 1,000 concurrent job submissions; report queue latency, throughput, success rate, cost per 1,000 captures and saturation.
6. Scale rendering capacity and configure paid resources only after measured demand and user approval.

## Acceptance criteria
1,000 simultaneous users can submit or receive explicit backpressure without crashing; no silent loss of jobs; no unbounded retries; accurate queue progress. Completion SLA must be established from load testing and paid/available renderer capacity, not assumed.
