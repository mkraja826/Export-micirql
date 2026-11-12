import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectUnifiedPages,inspectUnifiedCapture,buildUnifiedHealthReport,isSafeUnifiedPage,UNIFIED_MAX_PAGES} from '../public/tools/health/analyzer.js';
const site='https://unified.example/';
const html=page=>`<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${page} - Example</title><meta name="description" content="Demonstration of a readable customer page showing services and contact options.">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="${site}${page}"></head>
<body><header><nav><a href="/">Home</a><a href="/broken">Broken link</a>
<a href="/contact">Contact</a></nav></header><main><h1>Welcome to Example</h1>
<h2>Services and helpful information</h2><p>We help customers find services and contact details online with a responsive website.</p>
<img src="/logo.svg" alt="Example service logo"><form><label for="email">Email address</label>
<input id="email" type="email"></form></main><footer>Example</footer></body></html>`;
const capture=(page=site)=>({ok:true,url:page,partial:false,
 html:html(new URL(page).pathname.replace(/^\//,'')),httpEvidence:{observed:true,status:200}});
const analyzed=(page=site)=>inspectUnifiedCapture({requestedUrl:page,result:capture(page)});
test('unified discovery selects a bounded same-origin page set, entry first',()=>{
 const candidates=Array.from({length:83},(_,i)=>site+'p'+i);
 const selected=selectUnifiedPages([site+'#top','https://foreign.example/',...candidates],site);
 assert.equal(selected.length,60);assert.equal(selected[0],site);
 assert.equal(UNIFIED_MAX_PAGES,60);
 assert.ok(selected.every(p=>new URL(p).origin===new URL(site).origin));
 assert.throws(()=>selectUnifiedPages(candidates,site,61),/1 and 60/);
});
test('unsafe entered and discovered URLs never become page capture candidates',()=>{
 const blocked=[site+'logout',site+'api/delete',site+'checkout',site+'admin',site+'report.pdf',
  site+'?token=private','http://127.0.0.1/','http://localhost/','file:///etc/passwd',
  'https://user:secret@unified.example/'];
 for(const item of blocked){
  assert.equal(isSafeUnifiedPage(item),false,item);
  assert.throws(()=>selectUnifiedPages([],item),/safe public HTML page/,item);
 }
 const chosen=selectUnifiedPages([
  site+'about',site+'contact?token=private',site+'api/delete',site+'logout',
  site+'assets.js','https://untrusted.example/',site+'contact'
 ],site);
 assert.deepEqual(chosen,[site,site+'about',site+'contact']);
});
test('one HTML capture feeds SEO, QA, accessibility, and internal links',()=>{
 const record=analyzed();
 assert.equal(record.status,'complete');
 assert.equal(record.seo.findings instanceof Array,true);
 assert.equal(record.qa.findings instanceof Array,true);
 assert.equal(record.accessibility.status,'complete');
 assert.equal(record.url,site);
 assert.ok(record.linkTargets.includes(site+'broken'));
 assert.ok(record.linkTargets.includes(site+'contact'));
 assert.equal(record.http.status,200);
});
test('incomplete, unobserved, HTTP 404 and redirected HTML stays unverified',()=>{
 const cases=[
  {ok:false,error:'navigation_timeout'},
  {...capture(),partial:true},
  {...capture(),httpEvidence:{observed:true,status:404}},
  {...capture(),url:site+'moved'},
  {ok:true,url:site,html:'',partial:false}
 ];
 for(const result of cases){
  const record=inspectUnifiedCapture({requestedUrl:site,result});
  assert.equal(record.status,'unverified');
  assert.equal(record.seo,null);assert.equal(record.qa,null);
  assert.equal(record.accessibility,null);
  assert.deepEqual(record.linkTargets,[]);
 }
});
test('one combined report preserves separate evidence and HTTP 404 priorities',()=>{
 const entry=analyzed(),other=analyzed(site+'contact');
 const layoutSamples=[{requestedUrl:site,observations:[
  {verified:true,width:375,observedWidth:375,documentWidth:423,horizontalOverflowPx:48,
   missingMobileViewportMeta:false,scaledMobileLayout:false},
  {verified:true,width:768,observedWidth:768,documentWidth:768,horizontalOverflowPx:0},
  {verified:false,width:1440,reason:'Chrome debugger occupied'}
 ]}];
 const diag=[
  {destination:site+'broken',ok:true,status:404},
  {destination:site+'contact',ok:true,status:200},
  {destination:site,ok:false,status:404,reason:'unverified_cors'}
 ];
 const perf={ok:true,observed:true,url:site,scope:'one_unthrottled_browser_navigation',
  readyState:'complete',timing:{responseStartMs:115,loadEventMs:790},
  resources:{entryCount:1,entriesWithTransferSize:1,entriesWithoutTransferSize:0,
   reportedTransferBytes:500,byInitiatorType:{script:1}}};
 const report=buildUnifiedHealthReport({website:site,pages:[entry,other],
  discoveredPages:22,discoveryTruncated:true,linkDiagnostics:diag,
  sitemap:{observed:false,status:null},
  layoutSamples,
  securitySamples:[{requestedUrl:site,response:{ok:true,observed:true,
   status:200,url:site,headers:{'x-content-type-options':'nosniff'}}}],
  performanceObservation:perf});
 assert.equal(report.tool,'unified-health');
 assert.equal(report.sections.seo.status,'checked');
 assert.equal(report.sections.qa.status,'checked');
 assert.equal(report.sections.accessibility.status,'checked');
 assert.equal(report.sections.links.report.summary.broken,1);
 assert.equal(report.sections.links.report.summary.unverified,1);
 assert.equal(report.sections.responsive.report.summary.measuredOverflowSignals,1);
 assert.equal(report.sections.responsive.status,'partial');
 assert.equal(report.sections.security.status,'checked');
 assert.equal(report.sections.security.report.summary.observedHeaderChecks,1);
 assert.equal(report.sections.performance.status,'checked');
 assert.equal(report.sections.performance.report.unavailableCoreWebVitals.LCP,'not_measured');
 assert.equal(report.sections.screenshots.status,'not_run');
 assert.equal(report.priorities[0].priority,'high');
 assert.equal(report.priorities[0].source,'Links');
 assert.match(report.priorities[0].evidence,/HTTP 404/);
 assert.ok(!('healthScore' in report));assert.ok(!('score' in report));
 assert.ok(report.scope.note.includes('share'));
 assert.equal(report.scope.sourceHtmlCaptures,2);
});
test('partial source coverage and independent unrun browser checks are explicit',()=>{
 const unverified=inspectUnifiedCapture({requestedUrl:site+'missing',result:{ok:false,error:'timeout'}});
 const report=buildUnifiedHealthReport({website:site,pages:[analyzed(),unverified],
  discoveredPages:30,linkDiagnostics:[],sitemap:null,layoutSamples:[],
  securitySamples:[],performanceObservation:{ok:false,observed:false,reason:'unsupported'}});
 assert.equal(report.sections.seo.status,'partial');
 assert.equal(report.sections.qa.status,'partial');
 assert.equal(report.sections.accessibility.status,'partial');
 assert.equal(report.sections.links.status,'not_verified');
 assert.equal(report.sections.responsive.status,'not_verified');
 assert.equal(report.sections.security.status,'not_verified');
 assert.equal(report.sections.performance.status,'not_verified');
 assert.equal(report.sections.screenshots.status,'not_run');
 assert.equal(report.scope.sourcePagesUnverified,1);
 assert.equal(report.pages[1].reason,'timeout');
});
test('unified report cannot contain cross-origin, duplicate or over-limit pages',()=>{
 const page=analyzed();
 assert.throws(()=>buildUnifiedHealthReport({website:site,pages:[page,page]}),/repeated/);
 assert.throws(()=>buildUnifiedHealthReport({website:site,pages:[
  {...page,url:'https://foreign.example/'}]}),/Invalid/);
 assert.throws(()=>buildUnifiedHealthReport({website:site,pages:Array.from({length:61},()=>page)}),/limits/);
 assert.throws(()=>buildUnifiedHealthReport({website:site,pages:[page],linkDiagnostics:Array.from({length:61},()=>({}))}),/limits/);
});
test('unified user flow reuses extension bridge, presents one PDF and does not duplicate capture engines',()=>{
 const app=readFileSync(new URL('../public/tools/health/app.js',import.meta.url),'utf8');
 const view=readFileSync(new URL('../public/tools/health/index.html',import.meta.url),'utf8');
 const home=readFileSync(new URL('../public/tools/index.html',import.meta.url),'utf8');
 for(const type of ['MICIRQL_DISCOVER','MICIRQL_SEO_READ','MICIRQL_QA_LAYOUT',
  'MICIRQL_LINK_SITEMAP','MICIRQL_SEO_LINK_CHECK','MICIRQL_SECURITY_HEADERS',
  'MICIRQL_PERFORMANCE_OBSERVE'])assert.ok(app.includes(type),type);
 assert.match(app,/window\.print\(\)/);
 assert.match(view,/One website\. One report/);
 assert.match(view,/Print \/ Save PDF report/);
 assert.match(home,/\/tools\/health\/\?url=/);
 assert.doesNotMatch(app,/\/api\/discover|\/api\/seo\/html|\/api\/screenshot/);
});
