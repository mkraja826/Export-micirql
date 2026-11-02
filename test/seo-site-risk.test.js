import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessSeoSiteRisk,SITE_RISK_VERSION} from '../public/tools/seo/site-risk.js';
const page=(url,extras={})=>({url,auditStatus:'complete',score:97,partial:false,pageRole:'public',...extras});
const make=(reports,issueCenter=[],extras={})=>({reports,issueCenter,pagesSelected:reports.length,failures:[],coverage:{},...extras});
const issue=(code,severity,affectedUrls,extra={})=>({code,severity,affectedUrls,...extra});
test('verified homepage high-severity evidence is critical, with no numeric site score',()=>{
 const data=make([page('https://example.test/'),page('https://example.test/blog')],[issue('http_noindex','high',['https://example.test/'],{evidenceStatus:'verified'})]);
 const old=JSON.stringify(data);
 const risk=assessSeoSiteRisk(data);
 assert.equal(risk.version,SITE_RISK_VERSION);
 assert.equal(risk.level,'critical');assert.equal(risk.numericScore,null);
 assert.equal(risk.verifiedHighGroups,1);assert.equal(JSON.stringify(data),old);
 assert.equal(data.reports[0].score,97);
});
test('unverified issue severity is not represented as verified HTTP evidence',()=>{
 const risk=assessSeoSiteRisk(make([page('https://example.test/')],[issue('noindex','high',['https://example.test/'])]));
 assert.equal(risk.verifiedHighGroups,0);assert.equal(risk.unverifiedHighGroups,1);
 assert.equal(risk.findings[0].evidenceStatus,'not_verified');
 assert.equal(risk.level,'no_verified_high_risk');
});
test('duplicate affected URLs and duplicated issue groups do not amplify reach',()=>{
 const report=make([page('https://example.test/a/'),page('https://example.test/b')],[
  issue('missing_title','high',['https://example.test/a','https://example.test/a/'],{verified:true}),
  issue('missing_title','high',['https://example.test/a/'],{verified:true})
 ]);
 const risk=assessSeoSiteRisk(report);
 assert.equal(risk.findings.length,1);assert.equal(risk.findings[0].affectedPages,1);
 assert.equal(risk.findings[0].affectedPercent,50);
});
test('private login exclusion does not count toward public risk',()=>{
 const risk=assessSeoSiteRisk(make([page('https://example.test/'),page('https://example.test/login',{pageRole:'application'})],[
  issue('noindex','high',['https://example.test/login'],{verified:true})
 ]));
 assert.equal(risk.eligiblePublicPages,1);assert.equal(risk.findings.length,0);
 assert.equal(risk.level,'no_verified_high_risk');
});
test('incomplete audit remains unverified instead of healthy',()=>{
 const risk=assessSeoSiteRisk(make([page('https://example.test/'),page('https://example.test/slow',{partial:true,auditStatus:'partial'})],[],{
  failures:[{url:'https://example.test/fail'}],coverage:{discoveryTruncated:true}
 }));
 assert.equal(risk.coverageComplete,false);assert.equal(risk.level,'unverified');
 assert.match(risk.note,/incomplete/);
});
test('verified medium risk is moderate, high on a noncritical minority is high',()=>{
 const urls=Array.from({length:5},(_,i)=>'https://example.test/blog/post-'+i);
 const pages=urls.map(u=>page(u));
 assert.equal(assessSeoSiteRisk(make(pages,[issue('duplicate_description','medium',[urls[0]],{verified:true})])).level,'moderate');
 assert.equal(assessSeoSiteRisk(make(pages,[issue('broken_link','high',[urls[0]],{verified:true})])).level,'high');
});
test('unknown issue URL cannot imply confirmed website risk',()=>{
 const risk=assessSeoSiteRisk(make([page('https://example.test/')],[issue('noindex','high',['https://external.test/'],{verified:true})]));
 assert.equal(risk.findings.length,0);
});

test('Dashboard and PDF integrate independent risk evidence without replacing page score',()=>{
 const fs=requireFileText();
 assert.match(fs,/import \{assessSeoSiteRisk\} from '\.\/site-risk\.js'/);
 assert.match(fs,/siteReport\.siteRisk=assessSeoSiteRisk\(siteReport\)/);
 assert.match(fs,/Independent risk evidence:/);
 assert.match(fs,/No numeric website-health score has been assigned/);
});
function requireFileText(){
 return readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
}

test('benchmark: homepage high issue without critical HTTP/indexability evidence remains high',()=>{
 const risk=assessSeoSiteRisk(make([page('https://example.test/')],[
  issue('missing_title','high',['https://example.test/'],{verified:true})
 ]));
 assert.equal(risk.level,'high');
 assert.equal(risk.findings[0].criticalEligible,false);
});
test('benchmark: widespread high content findings cannot become critical solely by prevalence',()=>{
 const urls=Array.from({length:10},(_,i)=>'https://example.test/blog/'+i);
 const risk=assessSeoSiteRisk(make(urls.map(u=>page(u)),[
  issue('duplicate_title','high',urls,{verified:true})
 ]));
 assert.equal(risk.level,'high');
 assert.equal(risk.findings[0].affectedPercent,100);
});
test('benchmark: verified homepage noindex and widespread HTTP failures remain critical',()=>{
 const home='https://example.test/';
 const homepage=assessSeoSiteRisk(make([page(home)],[
  issue('noindex','high',[home],{verified:true})
 ]));
 assert.equal(homepage.level,'critical');
 const urls=Array.from({length:4},(_,i)=>'https://example.test/blog/'+i);
 const widespread=assessSeoSiteRisk(make(urls.map(u=>page(u)),[
  issue('http_5xx','high',urls.slice(0,2),{verified:true})
 ]));
 assert.equal(widespread.level,'critical');
});
test('benchmark: unverified homepage noindex must not count as confirmed critical',()=>{
 const url='https://example.test/';
 const risk=assessSeoSiteRisk(make([page(url)],[issue('noindex','high',[url])]));
 assert.equal(risk.level,'no_verified_high_risk');
 assert.equal(risk.verifiedHighGroups,0);
});

test('mixed verified and HTML-only observations count only verified URLs toward critical reach',()=>{
 const urls=Array.from({length:5},(_,i)=>'https://example.test/blog/page-'+i);
 const risk=assessSeoSiteRisk(make(urls.map(u=>page(u)),[
  issue('http_noindex','high',urls,{verifiedAffectedUrls:[urls[0]]})
 ]));
 assert.equal(risk.level,'high');
 assert.equal(risk.findings[0].affectedPercent,100);
 assert.equal(risk.findings[0].verifiedAffectedPercent,20);
 assert.deepEqual(risk.findings[0].verifiedAffectedUrls,[urls[0]]);
});
test('verified HTTP evidence provenance survives issue grouping in SEO dashboard source',()=>{
 const source=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(source,/issue\.evidenceConfidence==='verified'&&report\.httpVerification\?\.verified===true/);
 assert.match(source,/verifiedAffectedUrls:\[\.\.\.new Set\(issue\.verifiedAffectedUrls\|\|\[\]\)\]/);
});
