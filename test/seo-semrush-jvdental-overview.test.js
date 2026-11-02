import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSeoSiteRisk} from '../public/tools/seo/site-risk.js';
import {summarizeSeoSiteHealth} from '../public/tools/seo/site-health.js';

// Overview-only benchmark, transcribed from the user's Semrush jvdental.com
// Site Audit Overview generated November 2, 2026. This is NOT a live MiCirql crawl.
// Actual affected URLs, HTTP status codes, response headers and robots.txt text
// are absent in the overview. example.test URLs below are intentionally synthetic.
const base='https://example.test/';
const urls=Array.from({length:41},(_,i)=>i?base+'example-page-'+i:base);
const pages=urls.map((url,i)=>({
 url,requestedUrl:url,pageRole:'public',score:i===0?97:92,
 partial:i===38||i===39,
 auditStatus:i===40?'failed':i===38||i===39?'partial':'complete'
}));
const issue=(code,severity,affectedUrls,additional={})=>({code,severity,affectedUrls,...additional});
const overview={
 benchmarkSource:'Semrush Site Audit Overview for jvdental.com, 2026-11-02',
 benchmarkSiteHealthPercent:89,
 benchmarkAiSearchHealthPercent:89,
 benchmarkCrawledPages:41,
 benchmarkErrors:2,
 benchmarkWarnings:82,
 benchmarkCrawlStatuses:{haveIssues:37,blocked:2,broken:1,healthy:1}
};
const make=(items=[])=>({
 website:base,pagesSelected:41,reports:pages,failures:[{url:urls[40],reason:'DNS resolution issue'}],
 coverage:{discoveryTruncated:false,selectionLimited:false},
 issueCenter:items
});
test('Semrush overview: 89% score and 37 affected pages are not equivalent metrics',()=>{
 assert.equal(overview.benchmarkSiteHealthPercent,89);
 assert.equal(overview.benchmarkCrawledPages,41);
 assert.equal(overview.benchmarkCrawlStatuses.haveIssues,37);
 assert.equal(Object.values(overview.benchmarkCrawlStatuses).reduce((a,b)=>a+b,0),41);
 const result=summarizeSeoSiteHealth(make([]));
 assert.equal(result.numericSiteHealthScore,null);
 assert.equal(result.coverage.status,'incomplete');
});
test('Semrush overview counts cannot turn unverified robots/DNS claims into critical HTTP evidence',()=>{
 const original=JSON.stringify(pages);
 const report=make([
  issue('robots_txt_invalid','high',[urls[0]],{reportedOccurrences:1,verificationStatus:'Needs review'}),
  issue('dns_resolution_failure','high',[urls[40]],{reportedOccurrences:1,verificationStatus:'Unverified'}),
  issue('broken_external_links','medium',[urls[0]],{reportedOccurrences:35,verificationStatus:'Needs review'}),
  issue('low_text_html_ratio','medium',urls.slice(0,32),{reportedOccurrences:32}),
  issue('low_word_count','medium',urls.slice(0,11),{reportedOccurrences:11})
 ]);
 const result=assessSeoSiteRisk(report);
 assert.equal(result.numericScore,null);
 assert.equal(result.coverageComplete,false);
 assert.equal(result.level,'unverified');
 assert.equal(result.verifiedHighGroups,0);
 assert.equal(result.findings.some(x=>x.code==='robots_txt_invalid'&&x.verified),false);
 assert.equal(JSON.stringify(pages),original,'Benchmark must never rewrite page scoring');
});
test('Semrush 35 broken external-link instances do not imply 35 verified affected pages',()=>{
 const result=assessSeoSiteRisk(make([
  issue('broken_external_links','medium',[urls[0]],{reportedOccurrences:35})
 ]));
 const group=result.findings.find(x=>x.code==='broken_external_links');
 assert.equal(group.affectedPages,1,'Instance counts are not affected-page counts');
 assert.equal(group.verifiedAffectedPages,0,'No HTTP evidence was supplied');
 assert.notEqual(result.level,'critical');
});
test('Google-Extended restrictions are separate from ordinary Google Search risk',()=>{
 const result=assessSeoSiteRisk(make([
  issue('google_extended_blocked','info',urls.slice(0,40),{reportedOccurrences:40})
 ]));
 assert.equal(result.verifiedHighGroups,0);
 assert.equal(result.numericScore,null);
 assert.notEqual(result.level,'critical');
});
test('Repeated thin-copy advisory is not an automatic critical-risk finding',()=>{
 const result=assessSeoSiteRisk(make([
  issue('low_text_html_ratio','medium',urls.slice(0,32),{verifiedAffectedUrls:urls.slice(0,32)}),
  issue('low_word_count','medium',urls.slice(0,11),{verifiedAffectedUrls:urls.slice(0,11)})
 ]));
 assert.equal(result.level,'unverified','Incomplete coverage must still be disclosed');
 assert.equal(result.findings.filter(f=>f.criticalEligible).length,0);
});
