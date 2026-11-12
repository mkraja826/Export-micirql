import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePerformancePage,buildPerformanceReport,PERFORMANCE_METRIC_CODES} from '../public/tools/performance/analyzer.js';
const site='https://performance.example/';
const observed=(overrides={})=>({
 ok:true,observed:true,url:site,scope:'one_unthrottled_browser_navigation',
 readyState:'complete',
 timing:{responseStartMs:145.7,responseEndMs:198.4,domContentLoadedMs:394.5,
  loadEventMs:753.6,firstContentfulPaintMs:298.7},
 resources:{entryCount:5,entriesWithTransferSize:3,entriesWithoutTransferSize:2,
  reportedTransferBytes:120005,selectionTruncated:false,
  byInitiatorType:{script:2,css:1,img:1,font:0,fetch:0,xmlhttprequest:0,link:0,other:1}},
 ...overrides
});
test('public URL validation rejects internal, credentialed and likely state-changing paths',()=>{
 assert.equal(validatePerformancePage(site),site);
 assert.equal(validatePerformancePage(site+'about'),site+'about');
 for(const url of ['http://127.0.0.1/','http://localhost/','http://[::1]/',
  'http://router.internal/','https://user:pass@performance.example/',
  site+'logout',site+'checkout',site+'api/items',site+'report.pdf',
  site+'?token=secret',site+'#fragment','file:///etc/passwd',
  'https://performance.example:8443/']){
  assert.throws(()=>validatePerformancePage(url),/public HTTP\(S\) page/);
 }
});
test('one navigation produces measured timelines without creating a field CWV or score',()=>{
 const report=buildPerformanceReport({website:site,observation:observed()});
 assert.equal(report.status,'observed');
 assert.equal(report.metrics.responseStartMs,146);
 assert.equal(report.metrics.domContentLoadedMs,395);
 assert.equal(report.metrics.loadEventMs,754);
 assert.equal(report.metrics.firstContentfulPaintMs,299);
 assert.equal(report.resources.entryCount,5);
 assert.equal(report.resources.reportedTransferBytes,120005);
 assert.equal(report.resources.entriesWithoutTransferSize,2);
 assert.equal(report.resources.byInitiatorType.script,2);
 assert.equal(report.scope.pagesRequested,1);
 assert.equal(report.scope.pagesMeasured,1);
 assert.equal(report.scope.fieldData,false);
 assert.equal(report.scope.simulationThrottled,false);
 assert.equal(report.unavailableCoreWebVitals.LCP,'not_measured');
 assert.equal(report.unavailableCoreWebVitals.CLS,'not_measured');
 assert.equal(report.unavailableCoreWebVitals.INP,'not_measured');
 assert.ok(!('score' in report));
});
test('background-tab FCP can be unavailable even when navigation is observed',()=>{
 const report=buildPerformanceReport({website:site,observation:observed({
  timing:{responseStartMs:80,responseEndMs:100,domContentLoadedMs:210,loadEventMs:390,
   firstContentfulPaintMs:null}
 })});
 assert.equal(report.status,'observed');
 assert.equal(report.metrics.firstContentfulPaintMs,null);
 assert.equal(report.metrics.loadEventMs,390);
});
test('zero or invalid navigation metric values never become verified zero timings',()=>{
 const report=buildPerformanceReport({website:site,observation:observed({
  timing:{responseStartMs:0,responseEndMs:Infinity,domContentLoadedMs:-1,
   loadEventMs:'450',firstContentfulPaintMs:0.2}
 })});
 assert.equal(report.metrics.responseStartMs,null);
 assert.equal(report.metrics.responseEndMs,null);
 assert.equal(report.metrics.domContentLoadedMs,null);
 assert.equal(report.metrics.loadEventMs,null);
 assert.equal(report.metrics.firstContentfulPaintMs,1);
 assert.deepEqual(Object.keys(report.metrics),PERFORMANCE_METRIC_CODES);
});
test('missing, timed-out, incomplete or redirected observations never appear completed',()=>{
 for(const observation of [
  {ok:true,observed:false,url:site,reason:'timeout'},
  {ok:true,observed:true,url:'https://outside.example/',readyState:'complete',scope:'one_unthrottled_browser_navigation'},
  {ok:true,observed:true,url:site,readyState:'interactive',scope:'one_unthrottled_browser_navigation'},
  {ok:false,observed:false,error:'Chrome unavailable'},
  null
 ]){
  const report=buildPerformanceReport({website:site,observation});
  assert.equal(report.status,'unverified');
  assert.equal(report.scope.pagesMeasured,0);
  assert.ok(Object.values(report.metrics).every(v=>v===null));
  assert.equal(report.resources.reportedTransferBytes,null);
  assert.equal(report.resources.entryCount,null);
 }
});
test('asset size visibility is explicit; hidden transfer size is not summed as known network cost',()=>{
 const report=buildPerformanceReport({website:site,observation:observed()});
 assert.equal(report.resources.entriesWithoutTransferSize,2);
 assert.match(report.limitations.join(' '),/cross-origin privacy rules or cache/);
 const bad=buildPerformanceReport({website:site,observation:observed({
  resources:{entryCount:5,entriesWithTransferSize:4,entriesWithoutTransferSize:9,
   reportedTransferBytes:0}
 })});
 assert.equal(bad.resources.entryCount,null);
 assert.equal(bad.resources.reportedTransferBytes,null);
});
test('metadata never includes resource URL names or private page content',()=>{
 const report=buildPerformanceReport({website:site,observation:observed({
  resources:{entryCount:1,entriesWithTransferSize:0,entriesWithoutTransferSize:1,reportedTransferBytes:0,
   byInitiatorType:{img:1},names:['https://performance.example/private?api_token=secret']}
 })});
 assert.doesNotMatch(JSON.stringify(report),/api_token=secret/);
 assert.equal(report.resources.byInitiatorType.img,1);
});
test('Performance Lab follows trusted extension message pattern and printable PDF, not remote API',()=>{
 const app=readFileSync(new URL('../public/tools/performance/app.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/tools/performance/index.html',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../extension/bridge.js',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
 assert.match(app,/MICIRQL_PERFORMANCE_OBSERVE/);
 assert.match(app,/MICIRQL_PERFORMANCE_RESULT/);
 assert.match(app,/window\.print\(\)/);
 assert.match(bridge,/READ_PERFORMANCE_OBSERVATION/);
 assert.match(bridge,/performance-navigation/);
 assert.match(worker,/performance\.getEntriesByType\('navigation'\)/);
 assert.match(worker,/performance\.getEntriesByType\('resource'\)/);
 assert.match(worker,/first-contentful-paint/);
 assert.match(ui,/Print \/ Save PDF report/);
 assert.doesNotMatch(app,/\/api\/performance|\/api\/screenshot|PageSpeed Insights/);
});
