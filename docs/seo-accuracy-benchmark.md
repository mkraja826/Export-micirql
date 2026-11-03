# MiCirql SEO Studio — Independent accuracy benchmark

This tool evaluates **detection accuracy** on independently adjudicated URL + issue-code examples. It does **not** calculate a new website-health score, compare arbitrary Semrush percentages, or measure Google rankings. The synthetic CI gate protects software behavior; it is **not** evidence of real-world accuracy.

## Evidence collection

1. Export a normal MiCirql SEO audit JSON for a website. Retain `website`, `reports[]` and `issueCenter[]`. Preserve unscored HTTP error, partial and failed captures.
2. **Capture timing is mandatory:** the MiCirql audit JSON must have a timezone-qualified `generatedAt`, and independent evidence must be observed within 24 hours before or after the audit snapshot. Older reports cannot be used for current truth: the evaluator will abstain with `staleEvidence` or `auditTimeMissing` rather than claim false positives or false negatives. Never change timestamps merely to make a comparison pass.
3. An independent reviewer checks specific URLs for a specific finding. Record the original inspected URL, issue code, expected result and timestamp. Use real browser response/header evidence for HTTP checks; inspected page HTML for HTML checks; independently checked destination responses for link checks. Do not infer URL-level truth from a site-level summary.
4. Store a separate ground-truth JSON alongside the audit. Never edit the MiCirql audit to make it agree with the reviewer.
5. Repeat across sites of different industries and technical stacks, including both positive and negative cases. Record site selection and reviewer notes outside the evaluator.
6. Re-run the benchmark after releases. Review every false positive and false negative before changing detection code. Keep a held-out set that was not used to tune the rules.

## Example independently labeled input

Create `labels.json` from **actual observed evidence** — replace all sample values below; they are illustrative, not adjudicated results:

```json
{
  "schemaVersion": "micirql-seo-ground-truth-v1",
  "website": "https://example.com/",
  "reviewer": "Independent reviewer or team",
  "labels": [
    {
      "url": "https://example.com/",
      "code": "http_noindex",
      "expected": "present",
      "evidence": {
        "type": "independent-http",
        "observedAt": "2026-11-02T12:00:00Z",
        "detail": "Reviewer inspected main-document HTTP response and recorded X-Robots-Tag: noindex"
      }
    },
    {
      "url": "https://example.com/contact",
      "code": "http_noindex",
      "expected": "absent",
      "evidence": {
        "type": "independent-http",
        "observedAt": "2026-11-02T12:00:00Z",
        "detail": "Reviewer inspected main-document response headers; no noindex directive present"
      }
    }
  ]
}
```

The audit must contain an original `generatedAt` ISO 8601 timestamp with explicit timezone (`Z` or `±hh:mm`). Labels with valid evidence more than 24 hours away from that snapshot are excluded; missing audit timestamps also exclude all positive/negative labels. This protects the benchmark from comparing a changed website to an old scan, but does not eliminate changes within the window.

Supported `expected` values are `present`, `absent`, and `unknown`. Evidence types are `independent-http`, `independent-html` and `independent-link`. For known positive and negative labels, a timestamped, nonblank evidence explanation is required. Labels without a complete MiCirql inspection (or a verified HTTP error for an HTTP issue) are reported as **abstentions**, not false negatives or true negatives. An unknown label does not contribute to precision or recall.

## Run locally, offline

```bash
node scripts/evaluate-seo-accuracy.mjs --pair audit-jvdental.json labels-jvdental.json --pair audit-badseo.json labels-badseo.json --output results.json
```

`--enforce` exits unsuccessfully if the proposed numeric benchmark target is not met. It is intended for a deliberately curated, independent benchmark suite and should **not** be enabled as a release gate while the dataset is incomplete.

Reported metrics: true positives, false positives, true negatives, false negatives, precision, recall, false-positive rate, specificity, eligible label count, excluded label count, and up to 25 disagreement examples.

**Proposed preliminary sample screening:** at least 100 evaluable URL-level labels, at least 30 positives and 30 negatives, at least five sites with ten evaluable labels per site, and no more than 10% abstentions. **Proposed performance screening:** at least 95% precision and at least 95% recall. These are development targets, not evidence of achieved accuracy. Stronger, larger and held-out cross-industry validation is required for a credible external claim.

Even when all numeric thresholds pass, `readyForReleaseClaim` remains `false`: the script cannot authenticate an evidence screenshot, verify reviewer independence, detect selection bias or certify that ground-truth labels are correct. Human review and separate approval are required.

## Semrush JV Dental overview (November 2, 2026)

The uploaded Semrush overview reports Site Health 89%, 41 pages, two errors, 82 warnings, 35 broken external-link instances and two blocked pages. **It does not include the individual affected URLs or corresponding response evidence.** It is a useful discovery checklist, **not** a ground-truth dataset. Do not convert its percentages or counts into review labels or assign verified HTTP status without further inspection.

## Scope limitations

This evaluates labeled finding detection for pages actually inspected. It does not independently certify site-risk severity, importance of a landing page, crawl completeness beyond selected URLs, search indexing, rankings, traffic, or AI-bot accessibility. Site-risk classification is covered by separate synthetic rules until independently adjudicated site-risk scenarios are collected. Do not add real user data, private credentials or proprietary customer HTML to repository fixtures.

## Prepare independent-review cases from an existing MiCirql audit

Run the read-only draft generator:

```bash
node scripts/prepare-seo-review.mjs audit-jvdental.json --output review-draft.json --max 60
```

This prepares a bounded, deterministic queue of detected findings and undetected controls for reviewers. **All labels are set to `unknown` and contain no fabricated verification evidence.** The generated `micirql-seo-review-queue-v1` file is a working draft, **not** directly accepted as `micirql-seo-ground-truth-v1`.

A reviewer must open each URL, independently inspect the relevant HTML/headers/link target, record whether the finding is `present` or `absent`, and record timestamped evidence using the ground-truth format above. Leave inaccessible or uncertain URLs as `unknown` and retain abstentions. Use additional sampling to cover issue codes that never appear in the source audit; the queue generator cannot automatically invent negative controls for checks it did not observe.

For JV Dental, the provided Semrush overview has no affected URL list, so this process requires an actual MiCirql audit JSON and independent inspection. The Semrush overview is useful for selecting investigation topics but cannot supply verified URL-level labels.

## Historical audit caution

The earlier MiCirql JV Dental JSON audit was captured on 24 October 2026. It **must not** be compared directly with live November 2026 website evidence for a quantitative accuracy claim; a fresh capture and near-simultaneous independent review are required. The Semrush report summary remains discovery context, not URL-level ground truth.
