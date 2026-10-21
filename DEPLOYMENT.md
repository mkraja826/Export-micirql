# Export Micirql deployment

Production hostname: **export.micirql.com**.

The application is a Node.js/Express server with Playwright Chromium. Deploy it to a host that supports Chromium (for example a container host or VM). A standard Cloudflare Worker cannot run this implementation directly.

## Build and run

```bash
docker build -t export-micirql .
docker run --rm -p 3000:3000 export-micirql
```

The Playwright image is pinned to the matching Playwright npm version. For deployment, configure an HTTPS reverse proxy / managed host routing the public hostname to port 3000.

## Domain setup

1. Deploy the application and obtain the host-provided domain or public IP.
2. In Cloudflare DNS for micirql.com create **export** as CNAME to the host-provided domain (preferred) or A to the public IPv4 address.
3. Enable HTTPS on the hosting provider and use Cloudflare SSL/TLS **Full (strict)**. Avoid pointing DNS at an address before the application is deployed.
4. Verify `https://export.micirql.com` and test JPG, PNG, ZIP captures across all eight presets.

## Production gates

Before exposing the capture endpoint publicly: add robust egress firewall/SSRF prevention (DNS rebinding included), concurrency/rate limits, maximum page/screenshot height, browser sandbox hardening, persistent storage and observability. The MVP currently disables Chromium sandbox with `--no-sandbox`; do not treat it as a hardened public service. CI checks syntax only, not browser integration.

## Cloudflare alternative

For a serverless deployment, replace the Playwright launcher with a supported Cloudflare Browser Rendering integration and redesign long-running capture jobs around Workers limits and queues. This is not yet implemented.
