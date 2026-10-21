# Export Micirql

Capture real full-page screenshots of public websites at 320, 375, 430, 768, 1024, 1440, 1920 and 3840 CSS-pixel viewport widths.

## Run locally

Requires Node.js 20+.

```bash
npm install
npx playwright install --with-deps chromium
npm start
```

Open http://localhost:3000.

Choose JPG or PNG, capture selected widths, download individual images or a ZIP archive.

## Deployment

Requires a Node.js server capable of running Chromium. This cannot run unchanged on Cloudflare Workers. Use a container/VM or remote browser capture service for production.

## Security and production considerations

This is an MVP. It blocks obvious private IP ranges and validates redirects/subresources through request interception, but DNS rebinding and network-level SSRF protection require production egress controls. Run Chromium as an unprivileged user with sandboxing where supported (remove --no-sandbox in hardened deployments). Add authentication, per-user rate limits, concurrency queues, persistent object storage, job cancellation, strict timeouts and a maximum screenshot height before exposing publicly. Memory-held screenshots expire after 15 minutes; jobs in progress are not persisted. Some protected sites may block automation. 4K and very long pages can be memory intensive.
