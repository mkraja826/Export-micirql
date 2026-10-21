# MiCirql Export — Cloudflare-independent rendering architecture

## Decision
Cloudflare Workers may host the static UI and act as an API gateway, but must never invoke Cloudflare Browser Rendering. The actual screenshots run in self-managed Playwright/Chromium processes. No dependency on Cloudflare Browser Rendering quotas, accounts or bindings.

## Deployment topology
- Static UI: export.micirql.com, optionally Cloudflare Pages/Workers assets.
- API: Node.js HTTP service with authentication, admission control, job creation and polling.
- Queue/database: PostgreSQL durable jobs table with leases, attempts, timestamps, state, owner and idempotency key. A single-node SQLite WAL queue is acceptable for local prototype only.
- Renderer: independent Node.js Playwright worker processes, scalable across machines.
- Storage: S3-compatible object storage or mounted disk in development. TTL expiry and cleanup required.
- Download: short-lived authorized links to individual images and ZIP archives.

## Screenshot flow
1. User submits URL, home plus one primary subpage, chosen widths 375/768/1440 and JPG/PNG.
2. API normalizes and validates the request, checks quotas, deduplicates equivalent in-flight jobs, and persists a queued job.
3. Worker atomically leases the next job. Lease expiry permits recovery after crashes.
4. Worker opens a Chromium browser context, navigates to each page and captures all selected widths sequentially in the same browser process. Browser context isolation between jobs is mandatory.
5. Images are uploaded and results recorded individually. ZIP assembly occurs after captures complete; partial failures are preserved.
6. Client polls job status with backoff, then downloads expiring artifacts.

## Concurrency
Use a global worker concurrency cap based on CPU/RAM measurements. Do not start one browser per user. Implement queue depth limits and HTTP 429/503 backpressure with Retry-After. Prioritize fairness across users and bound per-domain concurrent captures. One thousand concurrent submissions are distinct from one thousand concurrent browser sessions.

## Security
Reject local/private/reserved IP destinations at DNS resolution AND at connection time, including redirect chains and DNS rebinding. Sandbox Chromium; disable unnecessary permissions; limit memory, CPU, navigation time, maximum screenshot height, page bytes, download size, redirects, and egress. Prevent metadata endpoint access. Do not use URL string validation as the sole SSRF control.

## Cache
Key: canonical URL, width, format, rendering version, capture options and freshness bucket. Deduplicate in-flight captures; cache completed results with a documented TTL. Do not cache authenticated/private pages in a shared cache.

## Capacity plan
Measure average browser CPU-seconds, peak memory, render latency and output size across representative sites. Calculate throughput as number of workers / mean capture duration, adjusting for contention. For 6,000 screenshots, completion time depends on measured throughput; do not promise a duration before benchmarking. Auto-scaling requires provisioned machines or an external compute provider and incurs costs.

## Migration stages
1. Implement the Node job API and durable queue in a separate service directory; keep the current Worker API temporarily for compatibility.
2. Implement Playwright renderer with browser reuse, per-job contexts and three viewport presets.
3. Connect the UI to POST /api/jobs, GET /api/jobs/:id and artifact downloads.
4. Add storage, deduplication, security and backpressure.
5. Deploy the renderer independently, test 100 then 1,000 concurrent submissions.
6. Remove the Browser Rendering binding and all quickAction calls after production cutover and tests.

## Non-goals
No dependence on Cloudflare Browser Rendering. No assertion that the platform is cost-free at scale. No claim that this design is already deployed.
