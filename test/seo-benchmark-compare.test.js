import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSeoAudits} from '../src/seo-benchmark-compare.js';
import {compareSeoAudits as browserCompare} from '../public/tools/seo/benchmark-compare.js';
const site='https://badseo.dev';
const page=(requestedUrl,url,findings=[],httpObserved=false)=>({requestedUrl,url,auditStatus:'complete',partial:false,findings:findings.map(code=>({code})),captureEvidence:{httpEvidence:{observed:httpObserved}}});
const audit=(reports,extras={})=>({website:site,reports,selectedPageUrls:reports.map(r=>r.requestedUrl),failures:[],siteFindings:[],...extras});
test('before and after distinguish requested inspections from unique final pages',()=>{
 const before=audit([page(site+'/',site+'/'),page(site+'/redirect/chain-1',site+'/')]);
 const after=audit([page(site+'/',site+'/'),page(site+'/redirect/chain-1',site+'/',[],true)]);
 const result=compareSeoAudits(before,after);
 assert.equal(result.before.inspections,2);
 assert.equal(result.before.uniqueFinalPages,1);
 assert.equal(result.after.httpObserved,1);
 assert.equal(result.comparableSelection,true);
});
test('newly found HTTP noindex is reported without claiming benchmark correctness',()=>{
 const before=audit([page(site+'/index/noindex-header',site+'/index/noindex-header')]);
 const after=audit([page(site+'/index/noindex-header',site+'/index/noindex-header',['http_noindex'],true)]);
 const result=compareSeoAudits(before,after);
 assert.deepEqual(result.newlyReported,['page:https://badseo.dev/index/noindex-header|http_noindex']);
 assert.equal(result.noLongerReported.length,0);
});
test('changed selection is explicitly noncomparable',()=>{
 const a=audit([page(site+'/a',site+'/a')]);
 const b=audit([page(site+'/b',site+'/b')]);
 assert.equal(compareSeoAudits(a,b).comparableSelection,false);
});
test('cross-site comparisons are rejected',()=>{
 const a=audit([page(site+'/a',site+'/a')]);
 assert.throws(()=>compareSeoAudits(a,{...a,website:'https://testingurl.dev'}),/same website/);
});

test('browser-delivered comparison matches CLI comparison',()=>{
 const earlier=audit([page(site+'/a',site+'/a')]);
 const latest=audit([page(site+'/a',site+'/a',['http_noindex'],true)]);
 assert.deepEqual(browserCompare(earlier,latest),compareSeoAudits(earlier,latest));
});
