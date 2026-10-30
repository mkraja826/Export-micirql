import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSeoAudits} from '../src/seo-benchmark-compare.js';
import {compareSeoAudits as browserCompare} from '../public/tools/seo/benchmark-compare.js';
const site='https://badseo.dev';
const page=(requestedUrl,url,findings=[],httpObserved=false)=>({requestedUrl,url,auditStatus:'complete',partial:false,findings:findings.map(code=>({code})),captureEvidence:{httpEvidence:{observed:httpObserved}}});
const audit=(reports,extras={})=>({website:site,scoringVersion:'micirql-seo-v3.2',reports,selectedPageUrls:reports.map(r=>r.requestedUrl),failures:[],siteFindings:[],...extras});
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

test('before-and-after counts still detected, disappeared and newly found issues only for complete matching pages',()=>{
 const url=site+'/services';
 const old=audit([page(url,url,['missing_canonical','missing_title'],true)]);
 const newer=audit([page(url,url,['missing_title','noindex'],true)]);
 const result=compareSeoAudits(old,newer);
 assert.deepEqual(result.comparablePages,[url]);
 assert.deepEqual(result.noLongerReported,['page:'+url+'|missing_canonical']);
 assert.deepEqual(result.remainingReported,['page:'+url+'|missing_title']);
 assert.deepEqual(result.newlyReported,['page:'+url+'|noindex']);
 assert.deepEqual(result.notComparedPages,[]);
});
test('failed or partial new pages cannot appear to have resolved old issues',()=>{
 const url=site+'/broken';
 const earlier=audit([page(url,url,['missing_title'])]);
 const incomplete={...page(url,url,[]),auditStatus:'partial',partial:true};
 const latest=audit([incomplete]);
 const result=compareSeoAudits(earlier,latest);
 assert.equal(result.comparablePages.length,0);
 assert.equal(result.noLongerReported.length,0);
 assert.deepEqual(result.notComparedPages,[url]);
 assert.equal(result.scoreComparison,null);
});
test('score changes require complete identical selections with matching scored public pages',()=>{
 const one=site+'/a',two=site+'/b';
 const scored=(url,score)=>({...page(url,url),score,pageRole:'public'});
 const earlier=audit([scored(one,62),scored(two,82)]);
 const latest=audit([scored(one,78),scored(two,86)]);
 const result=compareSeoAudits(earlier,latest);
 assert.deepEqual(result.scoreComparison,{before:72,after:82,change:10,publicPages:2});
 const partial=audit([scored(one,78),{...scored(two,86),auditStatus:'partial',partial:true}]);
 assert.equal(compareSeoAudits(earlier,partial).scoreComparison,null);
 const switched=audit([scored(one,78),scored(site+'/c',86)]);
 assert.equal(compareSeoAudits(earlier,switched).scoreComparison,null);
});
test('cross-page findings cannot claim repair when selection or coverage changes',()=>{
 const one=site+'/a',two=site+'/b';
 const older=audit([page(one,one),page(two,two)],{siteFindings:[{code:'duplicate_title',affectedUrls:[one,two]}]});
 const changed=audit([page(one,one)]);
 const unsafe=compareSeoAudits(older,changed);
 assert.equal(unsafe.noLongerReported.length,0);
 assert.deepEqual(unsafe.notComparedPages,[two]);
 const same=audit([page(one,one),page(two,two)]);
 const safe=compareSeoAudits(older,same);
 assert.deepEqual(safe.noLongerReported,['site:'+one+'|duplicate_title','site:'+two+'|duplicate_title']);
});
test('next check prioritizes high-severity unresolved findings, not rank predictions',()=>{
 const one=site+'/a';
 const earlier=audit([page(one,one)]);
 const latest=audit([{...page(one,one),findings:[{code:'missing_title',severity:'high'},{code:'missing_alt',severity:'low'}]}]);
 const result=compareSeoAudits(earlier,latest);
 assert.equal(result.nextCheck.code,'missing_title');
 assert.equal(result.nextCheck.severity,'high');
});

test('scoring-version changes block score deltas and claimed issue resolutions',()=>{
 const url=site+'/test';
 const old=audit([{...page(url,url,['missing_canonical']),pageRole:'public',score:70}],{scoringVersion:'micirql-seo-v3.1'});
 const current=audit([{...page(url,url,[]),pageRole:'public',score:100}]);
 const result=compareSeoAudits(old,current);
 assert.equal(result.scoringVersions.compatible,false);
 assert.equal(result.scoreComparison,null);
 assert.deepEqual(result.noLongerReported,[]);
 assert.deepEqual(result.newlyReported,[]);
 assert.deepEqual(result.comparablePages,[]);
 assert.equal(result.nextCheck,null);
 assert.deepEqual(result.notComparedPages,[url]);
 assert.match(result.caution,/Scoring rules differ/);
 assert.deepEqual(result,browserCompare(old,current));
});
test('legacy reports without scoring versions are never mistaken for comparable scores',()=>{
 const url=site+'/legacy';
 const old=audit([{...page(url,url,['missing_canonical']),score:70,pageRole:'public'}],{scoringVersion:undefined});
 const current=audit([{...page(url,url,[]),score:100,pageRole:'public'}]);
 const result=compareSeoAudits(old,current);
 assert.equal(result.scoreComparison,null);
 assert.equal(result.findingsComparable,false);
 assert.deepEqual(result.noLongerReported,[]);
 assert.match(result.caution,/no recorded scoring version/);
});
test('same-version audits with identical coverage preserve legitimate comparisons',()=>{
 const url=site+'/healthy';
 const before=audit([{...page(url,url,['missing_title']),score:70,pageRole:'public'}]);
 const after=audit([{...page(url,url,[]),score:85,pageRole:'public'}]);
 const result=compareSeoAudits(before,after);
 assert.equal(result.scoringVersions.compatible,true);
 assert.deepEqual(result.scoreComparison,{before:70,after:85,change:15,publicPages:1});
 assert.deepEqual(result.noLongerReported,['page:'+url+'|missing_title']);
});
