import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeSeoTechnicalCoverage} from '../public/tools/seo/technical-coverage.js';
const page=(verified)=>({url:'https://example.test/',pageRole:'public',auditStatus:'complete',httpVerification:{verified}});
test('HTML-only capture cannot imply technical checks passed',()=>{
 const summary=summarizeSeoTechnicalCoverage({reports:[page(false)]});
 assert.equal(summary.allChecked,false);
 assert.equal(summary.checks.find(c=>c.name.includes('robots.txt')).state,'not_checked');
 assert.equal(summary.checks.find(c=>c.name.includes('External link')).state,'not_checked');
 assert.equal(summary.checks[0].state,'not_verified');
});
test('observed HTTP statuses do not imply robots/DNS checks passed',()=>{
 const summary=summarizeSeoTechnicalCoverage({reports:[page(true)]});
 assert.equal(summary.checks[0].state,'checked');
 assert.equal(summary.checks[1].state,'not_checked');
 assert.equal(summary.checks[2].state,'not_checked');
});
test('unverified link checks never become confirmed broken links',()=>{
 const summary=summarizeSeoTechnicalCoverage({reports:[page(true)],externalLinkDiagnostics:[
  {classification:'broken',status:404},{classification:'unverified'},{classification:'reachable',status:200}
 ]});
 assert.equal(summary.checks[3].state,'partial');
 assert.match(summary.checks[3].detail,/2 verified external destinations; 1 unverified/);
});
