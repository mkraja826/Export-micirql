import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeSeoSiteHealth,SITE_HEALTH_PRESENTATION_VERSION} from '../public/tools/seo/site-health.js';
import {summarizeSeoTechnicalCoverage} from '../public/tools/seo/technical-coverage.js';

const page=(url,score=98,pageRole='public',extra={})=>({
 url,pageRole,score,partial:false,auditStatus:'complete',...extra
});
const report=(reports,issueCenter=[],extras={})=>({
 reports,issueCenter,pagesSelected:reports.length,failures:[],
 coverage:{selectionLimited:false,discoveryTruncated:false},...extras
});

test('BadSEO-like 97/100 HTML average cannot produce a Strong site-level assessment with high-severity issues',()=>{
 const pages=Array.from({length:32},(_,i)=>page('https://badseo.dev/demo/'+i,i===0?80:98));
 const originalScores=pages.map(p=>p.score);
 const assessment=summarizeSeoSiteHealth(report(pages,[
  {code:'missing_title',severity:'high',affectedUrls:[pages[0].url]},
  {code:'noindex',severity:'high',affectedUrls:[pages[2].url]},
  {code:'multiple_canonicals',severity:'high',affectedUrls:[pages[3].url]},
  {code:'http_noindex',severity:'high',affectedUrls:[pages[4].url]},
  {code:'unresolved_link_template',severity:'high',affectedUrls:[pages[5].url]}
 ]));
 assert.equal(assessment.version,SITE_HEALTH_PRESENTATION_VERSION);
 assert.equal(assessment.averagePublicHtmlScore,97);
 assert.equal(assessment.eligiblePublicPages,32);
 assert.equal(assessment.highSeverityGroups,5);
 assert.equal(assessment.overallAssessment,'Needs attention');
 assert.equal(assessment.numericSiteHealthScore,null);
 assert.match(assessment.scoreLabel,/not a full website SEO rating/);
 assert.match(assessment.interpretation,/verify page purpose/);
 assert.deepEqual(pages.map(p=>p.score),originalScores,'Site health transparency cannot rewrite page scores');
});

test('An incomplete audit with a high HTML average must not be described as strong or complete',()=>{
 const value=summarizeSeoSiteHealth(report([
  page('https://example.com/',100),
  page('https://example.com/contact',99), 
  page('https://example.com/partial',97,'public',{partial:true,auditStatus:'partial'})
 ],[],{pagesSelected:4,failures:[{url:'https://example.com/failed'}],
  coverage:{selectionLimited:true,discoveryTruncated:true}}));
 assert.equal(value.overallAssessment,'Audit incomplete');
 assert.equal(value.coverage.selected,4);
 assert.equal(value.coverage.completed,2);
 assert.equal(value.coverage.partial,1);
 assert.equal(value.coverage.failed,1);
 assert.equal(value.coverage.discoveryLimited,true);
 assert.equal(value.coverage.selectedCompletePercent,50);
 assert.match(value.confidenceNote,/coverage incomplete/i);
});

test('Intentional private/login noindex can stay outside public-site risk signals when waived by role',()=>{
 const value=summarizeSeoSiteHealth(report([
  page('https://example.com/',95),
  page('https://example.com/login',95,'application')
 ],[]));
 assert.equal(value.overallAssessment,'No high-priority signals detected');
 assert.equal(value.eligiblePublicPages,1);
 assert.equal(value.averagePublicHtmlScore,95);
});

test('Site health deduplicates URLs before calculating average and counts',()=>{
 const value=summarizeSeoSiteHealth(report([
  page('https://example.com/page/',35,'public',{requestedUrl:'https://example.com/page/'}),
  page('https://example.com/page',91,'public',{requestedUrl:'https://example.com/page',partial:true,auditStatus:'partial'}),
  page('https://example.com/other',90)
 ],[{code:'duplicate_title',severity:'medium'}],{pagesSelected:2}));
 assert.equal(value.eligiblePublicPages,2);
 assert.equal(value.averagePublicHtmlScore,63);
 assert.equal(value.overallAssessment,'Review needed');
 assert.equal(value.coverage.completed,2);
});

test('A zero-page or entirely unverified audit has no fake health score',()=>{
 const noPages=summarizeSeoSiteHealth(report([],[],{pagesSelected:0}));
 assert.equal(noPages.overallAssessment,'Audit incomplete');
 assert.equal(noPages.averagePublicHtmlScore,null);
 assert.equal(noPages.coverage.selectedCompletePercent,0);
 const failed=summarizeSeoSiteHealth(report([page('https://example.com/',null,'public',{auditStatus:'invalid_http_status'})],[],{pagesSelected:1}));
 assert.equal(failed.overallAssessment,'Audit incomplete');
 assert.equal(failed.averagePublicHtmlScore,null);
});

test('Mixed high-risk and incomplete coverage retains both warnings',()=>{
 const pages=[page('https://example.com/',98),page('https://example.com/fail',null,'public',{partial:true,auditStatus:'partial'})];
 const value=summarizeSeoSiteHealth(report(pages,[{code:'noindex',severity:'high'}],{
  pagesSelected:3,failures:[{url:'https://example.com/fail'},{url:'https://example.com/fail'}]
 }));
 assert.equal(value.overallAssessment,'Needs attention');
 assert.equal(value.highSeverityGroups,1);
 assert.equal(value.coverage.status,'incomplete');
 assert.equal(value.coverage.failed,1);
 assert.match(value.confidenceNote,/incomplete/);
});

test('Dashboard and PDF use the same assessment, not the old >=80 Strong threshold',()=>{
 const ui=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(ui,/import \{summarizeSeoSiteHealth\} from '\.\/site-health\.js'/);
 assert.match(ui,/siteReport\.siteHealth=summarizeSeoSiteHealth\(siteReport\)/);
 assert.match(ui,/scoreStatus=health\.overallAssessment/);
 assert.match(ui,/Website risk assessment/);
 assert.match(ui,/printHealth=summarizeSeoSiteHealth\(\{\.\.\.report,issueCenter:issues\}\)/);
 assert.match(ui,/Website risk assessment: '\+escapeHTML\(printHealth\.overallAssessment\)/);
 assert.match(ui,/not a full website SEO rating/);
 assert.doesNotMatch(ui,/mean>=80\?'Strong'/);
 assert.match(ui,/numeric whole-site SEO score has been calculated/);
});


test('Actual client PDF leads with BadSEO website risk rather than mislabeling 97 as excellent',()=>{
 const source=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const start=source.indexOf('function printClientSeoReport(report){');
 const end=source.indexOf('sitePrintButton.addEventListener',start);
 assert.ok(start>=0&&end>start);
 let output='';
 const print=new Function('window','alert','summarizeSeoSiteHealth','summarizeSeoTechnicalCoverage',
  source.slice(start,end)+';return printClientSeoReport;')(
   {open:()=>({document:{open(){},write(value){output=value},close(){}}})},
   ()=>{throw Error('Unexpected print popup block')},summarizeSeoSiteHealth,summarizeSeoTechnicalCoverage
  );
 const pages=Array.from({length:32},(_,i)=>page('https://badseo.dev/fixture-'+i,i===0?80:98));
 const issueCenter=Array.from({length:5},(_,i)=>({
  code:'important_issue_'+i,severity:'high',
  affectedUrls:[pages[i].url],recommendation:'Review the affected page'
 }));
 print({...report(pages,issueCenter),website:'https://badseo.dev',generatedAt:'2026-11-02'});
 assert.match(output,/Website risk assessment: Needs attention/);
 assert.match(output,/97\/100<\/strong>Average public-page HTML score \(not a full website SEO rating\)/);
 assert.ok(output.indexOf('Website risk assessment: Needs attention')<output.indexOf('97/100'));
 assert.match(output,/5 high-severity issue group\(s\)/);
 assert.ok(!output.includes('Strong (80–100)'),'High HTML scores must not become an overall Strong grade');
});

test('Empty audit PDF carries an explicit incomplete warning rather than a 100-style score',()=>{
 const source=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const a=source.indexOf('function printClientSeoReport(report){'),b=source.indexOf('sitePrintButton.addEventListener',a);
 let output='';
 const printer=new Function('window','alert','summarizeSeoSiteHealth','summarizeSeoTechnicalCoverage',
  source.slice(a,b)+';return printClientSeoReport;')(
   {open:()=>({document:{open(){},write(value){output=value},close(){}}})},()=>{},summarizeSeoSiteHealth,summarizeSeoTechnicalCoverage
  );
 printer({...report([],[],{pagesSelected:0}),website:'https://example.com',generatedAt:'2026-11-02'});
 assert.match(output,/Website risk assessment: Audit incomplete/);
 assert.match(output,/N\/A<\/strong>Average public-page HTML score/);
});
