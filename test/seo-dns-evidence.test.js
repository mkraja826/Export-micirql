import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeSeoTechnicalCoverage} from '../public/tools/seo/technical-coverage.js';
const bg=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../extension/manifest.json',import.meta.url),'utf8');
test('extension observes main-frame network errors and permits no guessed DNS classification',()=>{
 assert.match(manifest,/"webNavigation"/);
 assert.match(bg,/details\.frameId!==0/);
 assert.match(bg,/net::ERR_NAME_NOT_RESOLVED/);
 assert.match(bg,/chrome\.webNavigation\.onErrorOccurred\.removeListener\(onNavigationError\)/);
});
test('DNS resolution failure requires explicit Chrome code, not an arbitrary timeout message',()=>{
 const noEvidence=summarizeSeoTechnicalCoverage({failures:[{url:'https://example.test/',error:'DNS resolution issue',category:'capture_error'}]});
 assert.equal(noEvidence.checks[2].state,'partial');
 assert.match(noEvidence.checks[2].detail,/no confirmed DNS resolution error/);
 const observed=summarizeSeoTechnicalCoverage({failures:[{url:'https://example.test/',category:'dns_resolution_failed',navigationError:{errorCode:'net::ERR_NAME_NOT_RESOLVED'}}]});
 assert.equal(observed.checks[2].state,'checked');
 assert.match(observed.checks[2].detail,/1 browser-observed DNS resolution failure/);
});
test('DNS timeouts are inconclusive rather than proven name resolution failures',()=>{
 const result=summarizeSeoTechnicalCoverage({failures:[{category:'dns_timeout',navigationError:{errorCode:'net::ERR_DNS_TIMED_OUT'}}]});
 assert.equal(result.checks[2].state,'partial');
 assert.match(result.checks[2].detail,/1 DNS timeout/);
});
