# MiCirql Tools — Eight Essential Products Roadmap

Status: active implementation on GitHub `main` only. Each tool's status is based on code and release verification; no product is promoted automatically when a file is added.

## Product promise

One website URL → bounded, user-approved website inspection → explicit coverage and verification evidence → a concise, printable PDF. No customer site changes. Support standalone tools first, then a unified website-health report. Preserve the browser-extension-first path to avoid paid rendering as a default.

## Tools and gates

| Tool | Current state | Next gate |
| --- | --- | --- |
| Screenshot Studio | Available | Browser QA with 60-page/3-width ZIP reliability and clear failures |
| SEO Studio | Limited beta | Independent accuracy benchmarks; PDF completeness and evidence provenance |
| QA Testing Lab | Limited beta | Consistent accessible-name/layout evidence, browser coverage and A4 PDF |
| Link & Sitemap Inspector | Limited beta; release CI validated | Live site smoke with extension v0.3.20+; resume, redirects and sitemap indexes |
| Responsive Lab | Limited beta implementation | 3 sampled pages / 375, 768, 1440 CSS-pixel observations; CI/PDF gates and real-browser smoke; screenshot-backed clipping detection remains future work |
| Accessibility Studio | Limited beta implementation | QA-derived source signals on up to 60 pages; Chrome viewport control observations on 3 pages; manual contrast, keyboard and screen-reader checks still required |
| Security Inspector | Limited beta implementation | Three safe public page samples; credential-free browser-side HTTP header evidence, no redirects followed or false security score; CI and live browser smoke pending |
| Performance Lab | Limited beta implementation | One unthrottled local-Chrome page navigation: navigation events, optional FCP and partial resource sizes; no LCP/CLS/INP field claims; CI/PDF and real-browser release gates pending |

## Ordered engineering work

1. **Links milestone 1 (implemented and CI verified):** extension-based same-origin page discovery (60 max), HTML link extraction, HTTP destination checks (60 unique max), standard sitemap observation, referring-page evidence, print-friendly PDF, CI.
2. **Links milestone 2:** link-check retry and resume, sitemap index support, canonical sitemap comparison, redirect chain evidence and independent browser smoke. Do not count DNS/timeout/403 as confirmed broken links.
3. **Responsive milestone 1 (implemented, release validation in progress):** reuse QA viewport observations at 375/768/1440 on three sampled pages; record overflow and mobile viewport signals, missing measurements and evidence. Screenshot-backed clipping or overlap detection is NOT in this beta. Avoid numerical design grades.
4. **Unified report milestone 1:** read-only combination of SEO, Links, QA and Responsive summaries. Each section includes `checked / partial / not_verified`, inspection timestamps, evidence URLs and unscored failures.
5. **Accessibility milestone 1 (implemented; CI and browser QA pending):** reuse QA source checks for up to 60 pages, add HTML language/title review, sample up to 3 pages of read-only accessible-control observations, and produce an A4 review report. Keyboard traversal, computed contrast, and screen readers remain manual/out of scope. Never certify WCAG conformance from these signals.
6. **Security milestone 1 (implemented, release QA pending):** reuse the extension for a bounded passive GET of three safe public pages. Report HTTPS URL scheme, HSTS, CSP, MIME sniffing, referrer, permissions and frame policies; classify 3xx/HTTP errors/blocked requests independently. Do NOT claim a verified TLS certificate, scan private networks, test open ports, or turn missing headers into confirmed vulnerabilities. Real-browser, CORS and DNS-rebinding boundaries require further validation.
7. **Performance milestone 1 (implemented; release verification pending):** one safe public page in a temporary Chrome tab; bounded navigation-response, DOM-ready, load-event and optional FCP timing, plus up to 250 privacy-safe resource timing entries. No simulated throttling, cold-cache control, Lighthouse rating, CPU profiling, field LCP/CLS/INP or completeness claims. Independent Chrome browser QA and repeatability testing must follow.
8. **Hardening:** extension compatibility, 60-page stress/recovery, A4 PDF pagination, responsive QA, cross-site evidence benchmark, CI/deploy, accessibility, privacy, cost and scale.

## Unified Website Health — Milestone 1 (implemented, validation pending)

- Beginner entrypoint: the tools.micirql.com homepage URL field opens `/tools/health/?url=...`. A separate catalog entry is intentionally not added, keeping the original 15-tool registry unchanged.
- Browser-extension-first capture: **safe-only discovery** excludes known action routes and query-bearing URLs before navigation; discover up to 60 eligible same-origin pages; capture each selected HTML document **once**, then reuse that DOM snapshot for SEO, QA, accessibility and link extraction. Normal website scripts may still execute during a navigation, so this is not a sandboxed penetration-test environment.
- Additional bounded observations: up to 60 unique safe passive internal destination requests, up to three layout samples at 375/768/1440, up to three passive security-header observations, one optional unthrottled performance navigation, and standard sitemap response evidence.
- Eight visible PDF sections: SEO, QA, Links, Responsive, Accessibility, Security, Performance, Screenshots. Screenshot Studio is explicitly `not_run` because screenshot ZIP generation is separate and opt-in, not silently bundled into the report.
- Evidence policy: `checked`, `partial`, `not_verified` and `not_run` are reported per tool. Navigation failure or missing browser support must not be converted to a clean result. Only observed HTTP 404/410 is a confirmed broken destination.
- No global health score, invented field Web Vitals, WCAG certification, security exploitability ratings, or automatic customer-site changes. SEO HTML scores remain clearly labeled per-page heuristics.
- Acceptance gates: full main-branch unit/Worker tests, shared-analyzer fixtures, 60-page A4 PDF output, deployed route smoke, Chrome v0.3.23+ safe-discovery real-site integration and scoped reliability/accuracy benchmark. Beta remains limited until all release checks succeed.

## Release gates for each standalone tool

- Consistent URL validation, clear opt-in and a maximum of 60 selected pages.
- No fabricated source evidence: `unverified` is never a pass or confirmed failure.
- Run client and Node tests; verify all three main GitHub workflows, then smoke test the deployed UI with the current extension.
- A4 PDFs must include scope, observed findings, unavailable checks and the last report page.
- Default UX: URL → scan progress → PDF. Complexity is kept in developer/testing features, not the beginner workflow.
- Mark `available` only after real-world verification. Until then use `limited` for implemented betas.
- No paid browser rendering requirement for core extension-based scans, and no modifications to customer websites.
