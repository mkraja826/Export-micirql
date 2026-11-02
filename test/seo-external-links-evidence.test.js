import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSeoHtml} from '../public/tools/seo/inspector.js';
import {summarizeSeoTechnicalCoverage} from '../public/tools/seo/technical-coverage.js';
import {readFileSync} from 'node:fs';
const page='https://example.test/';
test('external anchors are recorded distinctly from internal anchors',()=>{
 const result=inspectSeoHtml('<html><head><title>Example</title></head><body><a href="/service">Service</a><a href="https://outside.test/dead#section">External</a><a href="mailto:test@example.test">Mail</a></body></html>',page);
 assert.deepEqual(result.externalLinkTargets,['https://outside.test/dead']);
 assert.ok(result.internalLinkTargets.includes('https://example.test/service'));
});
test('external links are not marked checked when missing or unverified',()=>{
 const empty=summarizeSeoTechnicalCoverage({reports:[]});
 assert.equal(empty.checks[3].state,'not_checked');
 const pending=summarizeSeoTechnicalCoverage({reports:[],externalLinkDiagnostics:[{classification:'unverified'}]});
 assert.equal(pending.checks[3].state,'not_verified');
});
test('partial external verification remains partial when destination limit is reached',()=>{
 const report=summarizeSeoTechnicalCoverage({reports:[],externalLinkCoverage:{discovered:40,selected:30,truncated:true},externalLinkDiagnostics:[{classification:'broken',status:404},{classification:'reachable',status:200}]});
 assert.equal(report.checks[3].state,'partial');
 assert.match(report.checks[3].detail,/38 unchecked due to limit/);
});
test('external-link PDF section preserves referring-page details and strict 404\/410 semantics',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/externalBroken=externalRows\.filter\(row=>row\.classification==='broken'&&\(row\.status===404\|\|row\.status===410\)\)/);
 assert.match(html,/Broken external destination/);
 assert.match(html,/Timeouts and blocked checks are not counted as broken/);
});
