import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const extension=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
const start=extension.indexOf('async function readPerformanceObservation(');
const end=extension.indexOf('chrome.runtime.onMessage.addListener(',start);
assert.ok(start!==-1&&end>start,'The read-only performance function must exist before the extension router');
const body=extension.slice(start,end);
const site='https://performance.example/';
function setup(options={}){
 const calls={tabsCreated:[],tabsRemoved:[],scripts:0,loads:0};
 const navigation={
  responseStart:123.4,responseEnd:222.7,domContentLoadedEventEnd:410.2,
  loadEventEnd:730.1
 };
 const resources=[
  {initiatorType:'script',transferSize:2300},
  {initiatorType:'img',transferSize:0},
  {initiatorType:'css',transferSize:1700}
 ];
 const fakeDocument={readyState:options.readyState??'complete'};
 const chrome={
  tabs:{
   async create(data){calls.tabsCreated.push(data);return{id:44}},
   async get(){return {id:44,url:options.loadedUrl??site,status:'complete'}},
   async remove(id){calls.tabsRemoved.push(id)}
  },
  scripting:{async executeScript(payload){calls.scripts++;return [{
   result:payload.func()
  }]}}
 };
 const sandbox={URL,chrome,document:fakeDocument,performance:{
  getEntriesByType(type){
   if(type==='navigation')return options.missingNavigation?[]:[navigation];
   if(type==='resource')return resources;
   if(type==='paint')return options.missingPaint?[]:[{name:'first-contentful-paint',startTime:343.2}];
   return [];
  }
 },waitForUsableTab:async()=>{calls.loads++;if(options.failLoad)throw Error('navigation_timeout')},
 wait:async()=>{}};
 const inspect=runInNewContext(body+'; readPerformanceObservation;',sandbox);
 return {inspect,calls};
}
test('performance observer opens one temporary Chrome tab and closes it',async()=>{
 const {inspect,calls}=setup();
 const result=await inspect(site);
 assert.equal(result.ok,true);assert.equal(result.observed,true);
 assert.equal(result.scope,'one_unthrottled_browser_navigation');
 assert.equal(result.readyState,'complete');
 assert.equal(result.timing.responseStartMs,123.4);
 assert.equal(result.timing.firstContentfulPaintMs,343.2);
 assert.equal(result.resources.entryCount,3);
 assert.equal(result.resources.entriesWithTransferSize,2);
 assert.equal(result.resources.entriesWithoutTransferSize,1);
 assert.equal(result.resources.reportedTransferBytes,4000);
 assert.equal(result.resources.byInitiatorType.script,1);
 assert.equal(calls.tabsCreated.length,1);
 assert.equal(calls.tabsCreated[0].active,false);
 assert.deepEqual(calls.tabsRemoved,[44]);
 assert.equal(calls.scripts,1);
 assert.equal(calls.loads,1);
});
test('unavailable FCP remains null and does not manufacture LCP or CLS',async()=>{
 const {inspect}=setup({missingPaint:true});
 const result=await inspect(site);
 assert.equal(result.observed,true);
 assert.equal(result.timing.firstContentfulPaintMs,null);
 assert.ok(!('LCP' in result.timing));
 assert.ok(!('CLS' in result.timing));
 assert.ok(!('INP' in result.timing));
});
test('partial navigation and missing navigation entry cannot be treated as successful measurements',async()=>{
 for(const opts of [{readyState:'interactive'},{missingNavigation:true},{failLoad:true}]){
  const {inspect,calls}=setup(opts);
  const result=await inspect(site);
  assert.equal(result.observed,false);
  assert.equal(calls.tabsRemoved.length,1);
 }
});
test('redirected or changed target pages are unverified and never execute timing script',async()=>{
 const {inspect,calls}=setup({loadedUrl:'https://outside.example/page'});
 const result=await inspect(site);
 assert.equal(result.observed,false);
 assert.equal(result.reason,'navigation_redirected_or_changed');
 assert.equal(calls.scripts,0);
 assert.equal(calls.tabsRemoved.length,1);
});
test('unsafe local URLs, query strings, credential URLs and action routes are rejected before tab creation',async()=>{
 const {inspect,calls}=setup();
 for(const url of ['http://127.0.0.1/','https://localhost/','https://[::1]/',
 'https://u:p@performance.example/','https://performance.example/?token=123',
 'https://performance.example/logout','https://performance.example/checkout',
 'https://performance.example/report.pdf','https://performance.example:8443/']){
  await assert.rejects(()=>inspect(url));
 }
 assert.equal(calls.tabsCreated.length,0);
});
test('Chrome extension declares the browser-timing bridge capability and keeps a single-observer busy gate',()=>{
 const bridge=readFileSync(new URL('../extension/bridge.js',import.meta.url),'utf8');
 assert.match(bridge,/performance-navigation/);
 assert.match(bridge,/READ_PERFORMANCE_OBSERVATION/);
 assert.match(extension,/performanceBusy=true/);
 assert.match(extension,/performanceBusy=false/);
 assert.match(extension,/if\(message\?\.type==='READ_PERFORMANCE_OBSERVATION'\)/);
 assert.doesNotMatch(body,/\.click\(|\.submit\(|\.dispatchEvent\(|\.value\s*=/);
});
